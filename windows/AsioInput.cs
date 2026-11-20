using System;
using System.Diagnostics;
using System.Linq;
using System.Runtime.InteropServices;
using System.Threading;
using NAudio.Wave.Asio;

namespace TemporalLoom
{
    internal sealed class AsioInput : IDisposable
    {
        private readonly LoomWindow app;
        private readonly System.Windows.Forms.Timer meter;
        private Capture capture;
        private string device;
        private long retryAt;
        private long publishedBuffer;
        private int recoveryAttempts;
        private string recoveryMessage;
        private int leftChannel, rightChannel = -1;
        private bool settingsOpen;
        private bool detailed;
        private int clipToken;
        private const int MaxRecoveryAttempts = 3;

        internal AsioInput(LoomWindow app)
        {
            this.app = app;
            meter = new System.Windows.Forms.Timer { Interval = 34 };
            meter.Tick += (sender, e) => Publish();
        }

        internal void List()
        {
            app.RunScript("Mic.asioDrivers(" + LoomWindow.Json(AsioDriver.GetAsioDriverNames()) + ")");
        }

        internal void Open(string driver)
        {
            Stop();
            try
            {
                device = driver;
                StartCapture(false);
                meter.Start();
            }
            catch (Exception ex)
            {
                string error = ex.Message;
                if (error.IndexOf("another ASIO host", StringComparison.OrdinalIgnoreCase) >= 0)
                    error = "The ASIO driver is already in use by another audio app. Close that app or release its ASIO driver.";
                Stop();
                app.RunScript("Mic.asioOpened([]," + LoomWindow.Json(error) + ",[])");
            }
        }

        private void StartCapture(bool recovered)
        {
            if (!AsioDriver.GetAsioDriverNames().Contains(device))
                throw new InvalidOperationException("The ASIO driver is unavailable.");
            capture = new Capture(AsioDriver.GetAsioDriverByName(device));
            capture.Detailed = detailed;
            try
            {
                capture.Start(app.Handle, leftChannel, rightChannel);
                capture.SetClipCapture(clipToken);
                var channels = ChannelLabels(device, capture.ChannelCount, capture.ChannelName);
                var stereo = StereoLabels(device, channels.Length);
                publishedBuffer = 0;
                string labels = LoomWindow.Json(channels) + ",null," + LoomWindow.Json(stereo);
                if (recovered) recoveryMessage = "Mic.asioRecovered(" + labels + ")";
                else app.RunScript("Mic.asioOpened(" + labels + ")");
            }
            catch
            {
                CloseCapture();
                throw;
            }
        }

        internal void SelectChannels(int left, int right)
        {
            if (capture != null && capture.SelectChannels(left, right))
            {
                leftChannel = left;
                rightChannel = right;
            }
        }

        internal void ShowSettings()
        {
            if (capture == null || settingsOpen) return;
            settingsOpen = true;
            try { capture.ShowSettings(); }
            finally { settingsOpen = false; }
        }

        internal void SetDetailedAnalysis(bool enabled)
        {
            detailed = enabled;
            if (capture != null) capture.Detailed = enabled;
        }

        internal void SetClipCapture(int token)
        {
            clipToken = token;
            if (capture != null) capture.SetClipCapture(token);
        }

        internal static string[] ChannelLabels(string driver, int count, Func<int, string> getName)
        {
            string[] zoom = { "CH 1", "CH 2", "CH 3", "CH 4", "CH 5 L", "CH 5 R", "CH 6 L", "CH 6 R",
                "CH 7 L", "CH 7 R", "CH 8 L", "CH 8 R", "Master L", "Master R" };
            bool isL6Max = IsL6Max(driver, count);
            return Enumerable.Range(0, count).Select(index =>
            {
                string fallback = "Input " + (index + 1);
                if (isL6Max) return fallback + " · " + zoom[index];
                string label = getName(index);
                return string.IsNullOrWhiteSpace(label) ? fallback : fallback + " · " + label;
            }).ToArray();
        }

        internal static string[] StereoLabels(string driver, int count)
        {
            if (IsL6Max(driver, count))
                return new[] { "CH 1 + 2", "CH 3 + 4", "CH 5 L/R", "CH 6 L/R", "CH 7 L/R", "CH 8 L/R", "Master L/R" };
            return Enumerable.Range(0, count / 2)
                .Select(pair => "Inputs " + (2 * pair + 1) + " / " + (2 * pair + 2)).ToArray();
        }

        private static bool IsL6Max(string driver, int count)
        {
            return count == 14 && driver.IndexOf("L6max", StringComparison.OrdinalIgnoreCase) >= 0;
        }

        private void Publish()
        {
            if (settingsOpen) return;
            long now = Stopwatch.GetTimestamp();
            if (capture == null)
            {
                if (device == null || now < retryAt) return;
                recoveryAttempts++;
                try { StartCapture(true); }
                catch (Exception ex) { ScheduleRecovery(now, ex.Message); }
                return;
            }
            long last = Interlocked.Read(ref capture.LastBuffer);
            string reason = Volatile.Read(ref capture.Error);
            if (reason != null || BuffersStalled(now, capture.StartedAt, last))
            {
                ScheduleRecovery(now, reason ?? "The driver stopped delivering audio buffers.");
                return;
            }
            if (last == 0 || last == publishedBuffer) return;
            if (recoveryMessage != null)
            {
                app.RunScript(recoveryMessage);
                recoveryMessage = null;
            }
            if (last - capture.StartedAt >= 5 * Stopwatch.Frequency) recoveryAttempts = 0;
            publishedBuffer = last;
            var pcm = capture.Recording;
            if (pcm != null)
            {
                string data = pcm.Drain();
                if (data != null) app.RunScript("clipMicPcm(" + pcm.Token + ",'" + data + "'," + pcm.Rate + ",2)");
            }
            app.RunScript("Mic.asioLevels(" + LoomWindow.Json(capture.ReadLevels()) + "," +
                (detailed ? LoomWindow.Json(capture.ReadSpectrum()) : "null") + ")");
        }

        internal static bool BuffersStalled(long now, long startedAt, long lastBuffer)
        {
            return lastBuffer == 0 ? now - startedAt > 3 * Stopwatch.Frequency
                : now - lastBuffer > Stopwatch.Frequency * 3 / 2;
        }

        private void ScheduleRecovery(long now, string reason)
        {
            CloseCapture();
            if (recoveryAttempts >= MaxRecoveryAttempts)
            {
                Stop();
                app.RunScript("Mic.asioStopped(" + LoomWindow.Json("ASIO could not reconnect. " + reason + " Turn Mic on to retry.") + ")");
                return;
            }
            retryAt = now + Stopwatch.Frequency * (recoveryAttempts + 1) / 2;
            app.RunScript("Mic.asioRecovering()");
        }

        private void CloseCapture()
        {
            var old = capture;
            capture = null;
            recoveryMessage = null;
            if (old != null)
            {
                try { old.Dispose(); }
                catch (Exception ex) { Trace.WriteLine("ASIO driver release failed: " + ex.Message); }
            }
        }

        internal void Stop()
        {
            meter.Stop();
            device = null;
            recoveryAttempts = 0;
            leftChannel = 0;
            rightChannel = -1;
            CloseCapture();
        }

        public void Dispose() { Stop(); meter.Dispose(); }

        private sealed class Capture : IDisposable
        {
            private readonly AsioDriver input;
            private AsioCallbacks callbacks;
            private BufferInfo[] buffers;
            private AsioChannelInfo[] channels;
            private SelectedChannels selection;
            private int frames;
            private double sampleRate;
            private int reading;
            private bool allocated, started;
            internal long StartedAt;
            internal long LastBuffer;
            internal string Error;
            internal volatile bool Detailed;
            internal volatile ClipPcm Recording;
            internal void SetClipCapture(int token) { Recording = token == 0 ? null : new ClipPcm(token, sampleRate); }
            internal int ChannelCount { get { return channels.Length; } }

            internal Capture(AsioDriver input) { this.input = input; }
            internal string ChannelName(int channel) { return channels[channel].name; }
            internal void ShowSettings() { input.ControlPanel(); }

            internal unsafe void Start(IntPtr owner, int left, int right)
            {
                if (!input.Init(owner)) throw new InvalidOperationException(input.GetErrorMessage());
                int count, outputs, min, max, granularity;
                input.GetChannels(out count, out outputs);
                if (count == 0) throw new InvalidOperationException("This driver has no input channels.");
                input.GetBufferSize(out min, out max, out frames, out granularity);
                if (frames <= 0) throw new InvalidOperationException("The ASIO driver reported an invalid buffer size.");
                try { sampleRate = input.GetSampleRate(); }
                catch (Exception ex) { Trace.WriteLine("Could not read ASIO sample rate: " + ex.Message); }
                if (!(sampleRate >= 8000 && sampleRate <= 768000)) sampleRate = 48000;
                channels = new AsioChannelInfo[count];
                buffers = new BufferInfo[count];
                for (int i = 0; i < count; i++)
                {
                    channels[i] = input.GetChannelInfo(i, true);
                    buffers[i] = new BufferInfo { IsInput = 1, Channel = i };
                }
                if (!SelectChannels(left, right)) SelectChannels(0, -1);
                callbacks = new AsioCallbacks
                {
                    pbufferSwitch = Read,
                    pbufferSwitchTimeInfo = ReadWithTime,
                    pasioMessage = DriverMessage,
                    psampleRateDidChange = rate => Volatile.Write(ref Error, "The driver sample rate changed.")
                };
                // Leave the device clock alone and create only input buffers.
                fixed (BufferInfo* buffer = buffers)
                    input.CreateBuffers((IntPtr)buffer, count, frames, ref callbacks);
                allocated = true;
                StartedAt = Stopwatch.GetTimestamp();
                Volatile.Write(ref reading, 1);
                started = true;
                input.Start();
            }

            internal bool SelectChannels(int left, int right)
            {
                if (left < 0 || left >= ChannelCount || right < -1 || right >= ChannelCount || left == right) return false;
                Volatile.Write(ref selection, new SelectedChannels(left, right, sampleRate));
                return true;
            }

            internal double[] ReadLevels()
            {
                var current = Volatile.Read(ref selection);
                var levels = new double[ChannelCount];
                levels[current.Left] = Volatile.Read(ref current.LeftLevel);
                if (current.Right >= 0) levels[current.Right] = Volatile.Read(ref current.RightLevel);
                return levels;
            }

            internal double[] ReadSpectrum()
            {
                var current = Volatile.Read(ref selection);
                bool pair = current.Right >= 0;
                var left = current.LeftBands;
                var right = current.RightBands;
                return new[] {
                    BandMeter.Combine(Volatile.Read(ref current.LeftLevel), Volatile.Read(ref current.RightLevel), pair),
                    BandMeter.Combine(Volatile.Read(ref left.Bass), Volatile.Read(ref right.Bass), pair),
                    BandMeter.Combine(Volatile.Read(ref left.Mid), Volatile.Read(ref right.Mid), pair),
                    BandMeter.Combine(Volatile.Read(ref left.High), Volatile.Read(ref right.High), pair),
                    Math.Max(Volatile.Read(ref left.Peak), Volatile.Read(ref right.Peak))
                };
            }

            private static bool SupportsMessage(AsioMessageSelector selector)
            {
                return selector == AsioMessageSelector.kAsioEngineVersion || selector == AsioMessageSelector.kAsioResetRequest ||
                    selector == AsioMessageSelector.kAsioBufferSizeChange || selector == AsioMessageSelector.kAsioSupportsTimeInfo;
            }

            private int DriverMessage(AsioMessageSelector selector, int value, IntPtr message, IntPtr option)
            {
                switch (selector)
                {
                    case AsioMessageSelector.kAsioSelectorSupported: return SupportsMessage((AsioMessageSelector)value) ? 1 : 0;
                    case AsioMessageSelector.kAsioEngineVersion: return 2;
                    case AsioMessageSelector.kAsioSupportsTimeInfo: return 1;
                    case AsioMessageSelector.kAsioResetRequest:
                    case AsioMessageSelector.kAsioBufferSizeChange:
                        Volatile.Write(ref Error, "The driver requested a reset.");
                        return 1;
                    default: return 0;
                }
            }

            private IntPtr ReadWithTime(IntPtr time, int index, bool direct)
            {
                Read(index, direct);
                return time;
            }

            private void Read(int index, bool direct)
            {
                if (Volatile.Read(ref reading) == 0 || (uint)index > 1) return;
                var requested = Volatile.Read(ref selection);
                bool analyze = Detailed;
                Volatile.Write(ref requested.LeftLevel, Level(requested.Left, index, analyze ? requested.LeftBands : null));
                if (requested.Right >= 0) Volatile.Write(ref requested.RightLevel, Level(requested.Right, index, analyze ? requested.RightBands : null));
                var recording = Recording;
                if (recording != null)
                {
                    int left = requested.Left, right = requested.Right >= 0 ? requested.Right : left;
                    recording.Copy(index == 0 ? buffers[left].First : buffers[left].Second, channels[left].type,
                        index == 0 ? buffers[right].First : buffers[right].Second, channels[right].type, frames);
                }
                Interlocked.Exchange(ref LastBuffer, Stopwatch.GetTimestamp());
            }

            private double Level(int channel, int index, BandMeter bands)
            {
                var buffer = buffers[channel];
                return BufferLevel(index == 0 ? buffer.First : buffer.Second, frames, channels[channel].type, bands);
            }

            public void Dispose()
            {
                Volatile.Write(ref reading, 0);
                try { if (started) input.Stop(); }
                finally
                {
                    try { if (allocated) input.DisposeBuffers(); }
                    finally { input.ReleaseComAsioDriver(); }
                }
                GC.KeepAlive(callbacks);
            }

            private sealed class SelectedChannels
            {
                internal readonly int Left, Right;
                internal double LeftLevel, RightLevel;

                internal readonly BandMeter LeftBands, RightBands;
                internal SelectedChannels(int left, int right, double rate)
                {
                    Left = left; Right = right;
                    LeftBands = new BandMeter(rate); RightBands = new BandMeter(rate);
                }
            }

            [StructLayout(LayoutKind.Sequential)]
            private struct BufferInfo
            {
                internal int IsInput, Channel;
                internal IntPtr First, Second;
            }
        }

        internal sealed class ClipPcm
        {
            private const int Capacity = 16384;
            private readonly short[] ring = new short[Capacity * 2];
            private readonly int stride;
            private long written, consumed;
            private int phase;
            internal readonly int Token, Rate;

            internal ClipPcm(int token, double sampleRate)
            {
                Token = token;
                stride = Math.Max(1, (int)Math.Ceiling(sampleRate / 96000));
                Rate = (int)Math.Round(sampleRate / stride);
            }

            internal void Copy(IntPtr left, AsioSampleType leftType, IntPtr right, AsioSampleType rightType, int count)
            {
                long next = written, limit = Volatile.Read(ref consumed) + Capacity;
                int i = phase;
                for (; i < count; i += stride)
                {
                    if (next >= limit) continue;
                    int offset = (int)(next++ & (Capacity - 1)) * 2;
                    ring[offset] = Sample(left, leftType, i);
                    ring[offset + 1] = left == right ? ring[offset] : Sample(right, rightType, i);
                }
                phase = i - count;
                Volatile.Write(ref written, next);
            }

            internal string Drain()
            {
                long start = consumed;
                int count = (int)Math.Min(4096, Volatile.Read(ref written) - start);
                if (count == 0) return null;
                var bytes = new byte[count * 4];
                int offset = (int)(start & (Capacity - 1));
                int first = Math.Min(count, Capacity - offset);
                Buffer.BlockCopy(ring, offset * 4, bytes, 0, first * 4);
                if (first < count) Buffer.BlockCopy(ring, 0, bytes, first * 4, (count - first) * 4);
                Volatile.Write(ref consumed, start + count);
                return Convert.ToBase64String(bytes);
            }

            private static unsafe short Sample(IntPtr source, AsioSampleType format, int index)
            {
                if (source == IntPtr.Zero) return 0;
                double sample;
                switch (format)
                {
                    case AsioSampleType.Int16LSB: return ((short*)source)[index];
                    case AsioSampleType.Int24LSB:
                        byte* p = (byte*)source + index * 3;
                        return (short)(p[1] | p[2] << 8);
                    case AsioSampleType.Int32LSB: return (short)(((int*)source)[index] >> 16);
                    case AsioSampleType.Float32LSB: sample = ((float*)source)[index]; break;
                    case AsioSampleType.Float64LSB: sample = ((double*)source)[index]; break;
                    default: return 0;
                }
                return double.IsNaN(sample) ? (short)0 : (short)Math.Max(-32768, Math.Min(32767, sample * 32768));
            }
        }

        internal sealed class BandMeter
        {
            private readonly double dcCoefficient, bassCoefficient, midCoefficient, rate;
            private double dc, bassLowpass, midLowpass, bassEnergy, midEnergy, highEnergy, samplePeak, peakFall;
            private int lastFrames;
            internal double Bass, Mid, High, Peak;

            internal BandMeter(double rate)
            {
                this.rate = rate;
                dcCoefficient = 1 - Math.Exp(-2 * Math.PI * 35 / rate);
                bassCoefficient = 1 - Math.Exp(-2 * Math.PI * 230 / rate);
                midCoefficient = 1 - Math.Exp(-2 * Math.PI * 2200 / rate);
            }

            internal void Add(double sample)
            {
                dc += dcCoefficient * (sample - dc);
                sample -= dc;
                bassLowpass += bassCoefficient * (sample - bassLowpass);
                midLowpass += midCoefficient * (sample - midLowpass);
                double mid = midLowpass - bassLowpass, high = sample - midLowpass;
                bassEnergy += bassLowpass * bassLowpass; midEnergy += mid * mid; highEnergy += high * high;
                samplePeak = Math.Max(samplePeak, Math.Abs(sample));
            }

            internal void Complete(int frames)
            {
                if (lastFrames != frames) { lastFrames = frames; peakFall = Math.Exp(-frames / (rate * .12)); }
                Volatile.Write(ref Bass, Math.Min(1, Math.Sqrt(bassEnergy / frames) * 8));
                Volatile.Write(ref Mid, Math.Min(1, Math.Sqrt(midEnergy / frames) * 8));
                Volatile.Write(ref High, Math.Min(1, Math.Sqrt(highEnergy / frames) * 8));
                Volatile.Write(ref Peak, Math.Max(Peak * peakFall, Math.Min(1, samplePeak * 2.8)));
                bassEnergy = midEnergy = highEnergy = samplePeak = 0;
            }

            internal static double Combine(double left, double right, bool stereo)
            {
                return stereo ? Math.Sqrt((left * left + right * right) * .5) : left;
            }
        }

        internal static unsafe double BufferLevel(IntPtr buffer, int frames, AsioSampleType type, BandMeter bands = null)
        {
            if (buffer == IntPtr.Zero || frames <= 0) return 0;
            double square = 0, fullScale = 1;
            switch (type)
            {
                case AsioSampleType.Float32LSB:
                    var floats = (float*)buffer;
                    for (int i = 0; i < frames; i++)
                    {
                        float sample = floats[i];
                        if (!float.IsNaN(sample) && !float.IsInfinity(sample))
                        {
                            square += (double)sample * sample;
                            if (bands != null) bands.Add(sample);
                        }
                    }
                    break;
                case AsioSampleType.Int16LSB:
                    var shorts = (short*)buffer;
                    fullScale = 32768;
                    for (int i = 0; i < frames; i++)
                    {
                        int sample = shorts[i]; square += (double)sample * sample;
                        if (bands != null) bands.Add(sample / fullScale);
                    }
                    break;
                case AsioSampleType.Int24LSB:
                    var bytes = (byte*)buffer;
                    for (int i = 0; i < frames; i++, bytes += 3)
                    {
                        int sample = bytes[0] | bytes[1] << 8 | (sbyte)bytes[2] << 16;
                        square += (double)sample * sample;
                        if (bands != null) bands.Add(sample / 8388608.0);
                    }
                    fullScale = 8388608;
                    break;
                case AsioSampleType.Int32LSB:
                    var integers = (int*)buffer;
                    fullScale = 2147483648;
                    for (int i = 0; i < frames; i++)
                    {
                        int sample = integers[i]; square += (double)sample * sample;
                        if (bands != null) bands.Add(sample / fullScale);
                    }
                    break;
                default: return 0;
            }
            if (bands != null) bands.Complete(frames);
            return Math.Min(1, Math.Sqrt(square / frames) * 9.36 / fullScale);
        }
    }
}

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
            try
            {
                capture.Start(app.Handle, leftChannel, rightChannel);
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
            app.RunScript("Mic.asioLevels(" + LoomWindow.Json(capture.ReadLevels()) + ")");
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
            private int reading;
            private bool allocated, started;
            internal long StartedAt;
            internal long LastBuffer;
            internal string Error;
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
                Volatile.Write(ref selection, new SelectedChannels(left, right));
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
                Volatile.Write(ref requested.LeftLevel, Level(requested.Left, index));
                if (requested.Right >= 0) Volatile.Write(ref requested.RightLevel, Level(requested.Right, index));
                Interlocked.Exchange(ref LastBuffer, Stopwatch.GetTimestamp());
            }

            private double Level(int channel, int index)
            {
                var buffer = buffers[channel];
                return BufferLevel(index == 0 ? buffer.First : buffer.Second, frames, channels[channel].type);
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

                internal SelectedChannels(int left, int right) { Left = left; Right = right; }
            }

            [StructLayout(LayoutKind.Sequential)]
            private struct BufferInfo
            {
                internal int IsInput, Channel;
                internal IntPtr First, Second;
            }
        }

        internal static unsafe double BufferLevel(IntPtr buffer, int frames, AsioSampleType type)
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
                        if (!float.IsNaN(sample) && !float.IsInfinity(sample)) square += (double)sample * sample;
                    }
                    break;
                case AsioSampleType.Int16LSB:
                    var shorts = (short*)buffer;
                    for (int i = 0; i < frames; i++) square += (double)shorts[i] * shorts[i];
                    fullScale = 32768;
                    break;
                case AsioSampleType.Int24LSB:
                    var bytes = (byte*)buffer;
                    for (int i = 0; i < frames; i++, bytes += 3)
                    {
                        int sample = bytes[0] | bytes[1] << 8 | (sbyte)bytes[2] << 16;
                        square += (double)sample * sample;
                    }
                    fullScale = 8388608;
                    break;
                case AsioSampleType.Int32LSB:
                    var integers = (int*)buffer;
                    for (int i = 0; i < frames; i++) square += (double)integers[i] * integers[i];
                    fullScale = 2147483648;
                    break;
                default: return 0;
            }
            return Math.Min(1, Math.Sqrt(square / frames) * 9.36 / fullScale);
        }
    }
}

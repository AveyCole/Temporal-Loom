using System;
using System.Diagnostics;
using System.Linq;
using System.Threading;
using NAudio.Wave;

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
        private const int MaxRecoveryAttempts = 3;

        internal AsioInput(LoomWindow app)
        {
            this.app = app;
            meter = new System.Windows.Forms.Timer { Interval = 34 };
            meter.Tick += (sender, e) => Publish();
        }

        internal void List()
        {
            app.RunScript("Mic.asioDrivers(" + LoomWindow.Json(AsioOut.GetDriverNames()) + ")");
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
            if (!AsioOut.GetDriverNames().Contains(device))
                throw new InvalidOperationException("The ASIO driver is unavailable.");
            var input = new AsioOut(device);
            try
            {
                var next = new Capture(input);
                var channels = ChannelLabels(device, next.Levels.Length, input.AsioInputChannelName);
                var stereo = StereoLabels(device, channels.Length);
                capture = next;
                publishedBuffer = 0;
                next.Start();
                string labels = LoomWindow.Json(channels) + ",null," + LoomWindow.Json(stereo);
                if (recovered) recoveryMessage = "Mic.asioRecovered(" + labels + ")";
                else app.RunScript("Mic.asioOpened(" + labels + ")");
            }
            catch
            {
                // The capture owns the callbacks as soon as it is attached.
                if (capture != null) CloseCapture();
                else input.Dispose();
                throw;
            }
        }

        internal static double ChannelLevel(float[] buffer, int frames, int stride, int channel)
        {
            if (frames <= 0) return 0;
            double square = 0;
            for (int frame = 0, i = channel; frame < frames; frame++, i += stride)
            {
                var sample = buffer[i];
                if (!float.IsNaN(sample) && !float.IsInfinity(sample)) square += (double)sample * sample;
            }
            return Math.Min(1, Math.Sqrt(square / frames) * 9.36);
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
            var snapshot = new double[capture.Levels.Length];
            for (int i = 0; i < snapshot.Length; i++) snapshot[i] = Volatile.Read(ref capture.Levels[i]);
            app.RunScript("Mic.asioLevels(" + LoomWindow.Json(snapshot) + ")");
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
            CloseCapture();
        }

        public void Dispose() { Stop(); meter.Dispose(); }

        private sealed class Capture : IDisposable
        {
            private readonly AsioOut input;
            private float[] samples = new float[0];
            internal readonly double[] Levels;
            internal long StartedAt;
            internal long LastBuffer;
            internal string Error;

            internal Capture(AsioOut input)
            {
                this.input = input;
                int count = input.DriverInputChannelCount;
                if (count == 0) throw new InvalidOperationException("This driver has no input channels.");
                Levels = new double[count];
            }

            internal void Start()
            {
                int rate = input.IsSampleRateSupported(48000) ? 48000 : 44100;
                input.AudioAvailable += Read;
                input.DriverResetRequest += ResetRequested;
                input.PlaybackStopped += PlaybackStopped;
                input.InitRecordAndPlayback(null, Levels.Length, rate);
                StartedAt = Stopwatch.GetTimestamp();
                input.Play();
            }

            private void ResetRequested(object sender, EventArgs args)
            {
                Volatile.Write(ref Error, "The driver requested a reset.");
            }

            private void PlaybackStopped(object sender, StoppedEventArgs args)
            {
                Volatile.Write(ref Error, args.Exception == null ? "ASIO capture stopped." : args.Exception.Message);
            }

            private void Read(object sender, AsioAudioAvailableEventArgs args)
            {
                try
                {
                    int count = args.InputBuffers.Length;
                    int needed = count * args.SamplesPerBuffer;
                    if (needed == 0) return;
                    if (samples.Length < needed) samples = new float[needed];
                    args.GetAsInterleavedSamples(samples);
                    for (int channel = 0; channel < Math.Min(count, Levels.Length); channel++)
                        Volatile.Write(ref Levels[channel], ChannelLevel(samples, args.SamplesPerBuffer, count, channel));
                    Interlocked.Exchange(ref LastBuffer, Stopwatch.GetTimestamp());
                }
                catch (Exception ex) { Volatile.Write(ref Error, ex.Message); }
            }

            public void Dispose()
            {
                input.AudioAvailable -= Read;
                input.DriverResetRequest -= ResetRequested;
                input.PlaybackStopped -= PlaybackStopped;
                input.Dispose();
            }
        }
    }
}

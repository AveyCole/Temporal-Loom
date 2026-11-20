using System;
using System.Diagnostics;
using System.IO;
using System.Runtime.InteropServices;
using System.Threading.Tasks;
using System.Windows.Forms;

namespace TemporalLoom
{
    [ComVisible(true)]
    [ClassInterface(ClassInterfaceType.AutoDual)]
    public sealed class ClipBridge
    {
        private readonly ClipRecorder clips;
        internal ClipBridge(ClipRecorder clips) { this.clips = clips; }
        public bool Begin(string format) { return clips.Begin(format); }
        public bool Write(string data) { return clips.Write(data); }
        public void Discard() { clips.Discard(); }
    }

    internal sealed class ClipRecorder
    {
        private readonly LoomWindow app;
        private readonly object gate = new object();
        private FileStream stream;
        private string pending, lastSaved;
        private bool encoding;
#if VERIFY
        internal string TestDestination;
#endif

        internal ClipRecorder(LoomWindow app) { this.app = app; }

        internal bool Begin(string format)
        {
            lock (gate)
            {
                if (pending != null || encoding) return false;
                try
                {
                    pending = Path.Combine(Path.GetTempPath(), "loom-" + Guid.NewGuid().ToString("N") + (format == "mp4" ? ".mp4" : ".webm"));
                    stream = File.Open(pending, FileMode.CreateNew, FileAccess.Write, FileShare.Read);
                    return true;
                }
                catch (IOException) { pending = null; return false; }
            }
        }

        internal bool Write(string data)
        {
            lock (gate)
            {
                if (stream == null || data.Length > 180000) return false;
                try { byte[] bytes = Convert.FromBase64String(data); stream.Write(bytes, 0, bytes.Length); return true; }
                catch (Exception) { return false; }
            }
        }

        internal void Discard()
        {
            lock (gate)
            {
                if (encoding) return;
                if (stream != null) { stream.Dispose(); stream = null; }
                if (pending != null) { Delete(pending); pending = null; }
            }
        }

        internal async Task Save()
        {
            string source;
            lock (gate)
            {
                if (stream == null || encoding) return;
                stream.Dispose();
                stream = null;
                source = pending;
                pending = null;
                encoding = true;
            }
            string encoded = Path.Combine(Path.GetTempPath(), "loom-" + Guid.NewGuid().ToString("N") + ".mp4");
            try
            {
                string destination = null;
#if VERIFY
                destination = TestDestination;
#endif
                if (string.IsNullOrEmpty(destination))
                {
                    using (var dialog = new SaveFileDialog { Filter = "MP4 video|*.mp4", FileName = "Temporal-Loom-" + DateTime.Now.ToString("yyyyMMdd-HHmmss") + ".mp4" })
                    {
                        if (dialog.ShowDialog(app) != DialogResult.OK) { Status("Clip save cancelled."); return; }
                        destination = dialog.FileName;
                    }
                }
                Status("Preparing MP4…");
                await Task.Run(() =>
                {
                    ConvertToMp4(source, encoded);
                    File.Copy(encoded, destination, true);
                });
                lastSaved = destination;
                app.RunScript("document.getElementById('shareClip').hidden=false");
                Status("Clip saved.");
            }
            catch (Exception error) { Status("Could not save the MP4. " + error.Message); }
            finally
            {
                Delete(source);
                Delete(encoded);
                lock (gate) encoding = false;
            }
        }

        internal void Reveal()
        {
            if (lastSaved != null && File.Exists(lastSaved))
                Process.Start(new ProcessStartInfo("explorer.exe", "/select,\"" + lastSaved + "\"") { UseShellExecute = true });
        }

        private static void ConvertToMp4(string source, string destination)
        {
            bool avc = string.Equals(Path.GetExtension(source), ".mp4", StringComparison.OrdinalIgnoreCase);
            string video = avc ? "-c:v copy" : "-vf \"pad=ceil(iw/2)*2:ceil(ih/2)*2\" -c:v libx264 -preset fast -crf 16 -pix_fmt yuv420p";
            string ffmpeg = Path.Combine(AppDomain.CurrentDomain.BaseDirectory, "ffmpeg.exe");
            using (var process = Process.Start(new ProcessStartInfo(ffmpeg,
                "-hide_banner -loglevel error -nostdin -i \"" + source +
                "\" -map 0:v:0 -map 0:a? " + video + " -c:a aac -b:a 192k -movflags +faststart -y \"" +
                destination + "\"") { UseShellExecute = false, CreateNoWindow = true, RedirectStandardError = true }))
            {
                string errors = process.StandardError.ReadToEnd();
                process.WaitForExit();
                if (process.ExitCode != 0 || !File.Exists(destination))
                    throw new IOException(string.IsNullOrWhiteSpace(errors) ? "Video conversion failed." : errors.Trim().Split('\n')[0]);
            }
        }

        private void Status(string message) { app.RunScript("clipStatus(" + LoomWindow.Json(message) + ")"); }

        private static void Delete(string path)
        {
            try { File.Delete(path); }
            catch (IOException) { }
            catch (UnauthorizedAccessException) { }
        }
    }
}

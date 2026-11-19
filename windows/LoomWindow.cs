using System;
using System.Collections.Generic;
using System.Diagnostics;
using System.Drawing;
using System.IO;
using System.Threading.Tasks;
using System.Web.Script.Serialization;
using System.Windows.Forms;
using Microsoft.Web.WebView2.Core;
using Microsoft.Web.WebView2.WinForms;

namespace TemporalLoom
{
    internal static class Program
    {
        [STAThread]
        private static void Main(string[] args)
        {
            Application.EnableVisualStyles();
            Application.SetCompatibleTextRenderingDefault(false);
            Application.Run(new LoomWindow(args));
        }
    }

    internal sealed class LoomWindow : PerformanceWindow
    {
        internal const string Origin = "https://loom.invalid";
        internal readonly WebView2 View = new WebView2 { Dock = DockStyle.Fill };
        internal readonly string AppData;
        internal readonly CoreWebView2EnvironmentOptions BrowserOptions = new CoreWebView2EnvironmentOptions("--autoplay-policy=no-user-gesture-required");
        internal CoreWebView2Environment BrowserEnvironment;
        internal readonly Sources Sources;
        internal readonly GoogleBrowser Google;
        private readonly MidiInput midi;
        private readonly ClipRecorder clips;
        private readonly AsioInput asio;
        private readonly string[] args;
        private DisplayWindow display;
        private Rectangle previousDisplayBounds;

        internal LoomWindow(string[] args)
        {
            this.args = args;
            AppData = Path.Combine(Environment.GetFolderPath(Environment.SpecialFolder.LocalApplicationData), "Temporal Loom");
#if VERIFY
            int verification = Array.IndexOf(args, "--verify");
            if (verification >= 0 && verification + 1 < args.Length)
                AppData = Path.Combine(Path.GetFullPath(args[verification + 1]), "Isolated browser profile");
            if (Array.IndexOf(args, "--camera-only") >= 0)
                BrowserOptions.AdditionalBrowserArguments += " --use-fake-device-for-media-stream --use-fake-ui-for-media-stream";
#endif
            Text = "Temporal Loom";
            Icon = Icon.ExtractAssociatedIcon(Application.ExecutablePath);
            MinimumSize = new Size(720, 480);
            ClientSize = new Size(1240, 850);
            StartPosition = FormStartPosition.CenterScreen;
            BackColor = Color.FromArgb(16, 24, 23);
            Directory.CreateDirectory(AppData);
            Sources = new Sources(this);
            Google = new GoogleBrowser(this);
            midi = new MidiInput(this);
            clips = new ClipRecorder(this);
            asio = new AsioInput(this);
            Controls.Add(View);
            Shown += Initialize;
            Resize += (sender, e) => RunScript("typeof setVideoBackgrounded==='function' && setVideoBackgrounded(" +
                (WindowState == FormWindowState.Minimized ? "true" : "false") + ")");
            FormClosed += (sender, e) =>
            {
                if (display != null) display.Close();
                asio.Dispose(); midi.Dispose(); clips.Discard(); Google.Dispose(); Sources.CloseVideoAudio();
            };
        }

        internal static string Json(object value)
        {
            return new JavaScriptSerializer { MaxJsonLength = 6 * 1024 * 1024 }.Serialize(value);
        }

        internal static bool IsTrusted(string value)
        {
            Uri url;
            return Uri.TryCreate(value, UriKind.Absolute, out url) && url.Scheme == "https" &&
                url.Host == "loom.invalid" && url.IsDefaultPort && url.UserInfo.Length == 0;
        }

        internal static void OpenLink(string value)
        {
            Uri url;
            if (Uri.TryCreate(value, UriKind.Absolute, out url) && url.Scheme == "https" && url.UserInfo.Length == 0)
                Process.Start(new ProcessStartInfo(url.AbsoluteUri) { UseShellExecute = true });
        }

        private async void Initialize(object sender, EventArgs args)
        {
            try
            {
                BrowserEnvironment = await CoreWebView2Environment.CreateAsync(null, Path.Combine(AppData, "Browser"), BrowserOptions);
                await View.EnsureCoreWebView2Async(BrowserEnvironment);
                var core = View.CoreWebView2;
                core.Settings.AreDevToolsEnabled = false;
                core.Settings.AreDefaultContextMenusEnabled = false;
                core.Settings.IsStatusBarEnabled = false;
                core.Settings.IsZoomControlEnabled = false;
                core.NavigationStarting += (s, e) =>
                {
                    if (IsTrusted(e.Uri)) return;
                    e.Cancel = true;
                    if (e.IsUserInitiated) OpenLink(e.Uri);
                };
                core.FrameNavigationStarting += (s, e) => { if (!IsTrusted(e.Uri)) e.Cancel = true; };
                core.NewWindowRequested += OpenWindow;
                core.PermissionRequested += (s, e) =>
                {
                    bool capture = e.PermissionKind == CoreWebView2PermissionKind.Microphone || e.PermissionKind == CoreWebView2PermissionKind.Camera;
                    if (!IsTrusted(e.Uri) || (capture && !e.IsUserInitiated))
                        e.State = CoreWebView2PermissionState.Deny;
                };
                core.AddWebResourceRequestedFilter(Origin + "/*", CoreWebView2WebResourceContext.All, CoreWebView2WebResourceRequestSourceKinds.All);
                core.WebResourceRequested += Sources.Request;
                core.AddHostObjectToScript("loomClip", new ClipBridge(clips));
                core.WebMessageReceived += OnMessage;
#if VERIFY
                if (Array.IndexOf(this.args, "--verify") >= 0)
                    core.NavigationCompleted += async (s, e) => { if (e.IsSuccess) await Verification.Run(this, this.args); };
#endif
                core.Navigate(Origin + "/");
            }
            catch (Exception e)
            {
                MessageBox.Show("Temporal Loom needs Microsoft Edge WebView2 Runtime.\n\n" + e.Message,
                    Text, MessageBoxButtons.OK, MessageBoxIcon.Error);
                Close();
            }
        }

        private async void OpenWindow(object sender, CoreWebView2NewWindowRequestedEventArgs e)
        {
            e.Handled = true;
            if (e.Uri != DisplayWindow.Page)
            {
                if (e.IsUserInitiated) OpenLink(e.Uri);
                return;
            }
            if (display != null) return;
            using (e.GetDeferral())
            {
                var output = new DisplayWindow(this, previousDisplayBounds);
                display = output;
                output.FormClosed += (s, args) =>
                {
                    previousDisplayBounds = output.WindowedBounds;
                    display = null;
                    RunScript("displayDisconnected()");
                };
                try
                {
                    output.Show();
                    await output.View.EnsureCoreWebView2Async(BrowserEnvironment);
                    if (output.IsDisposed || IsDisposed) return;
                    output.ConfigureBrowser();
                    e.NewWindow = output.View.CoreWebView2;
                    output.ServePage(BrowserEnvironment);
                    output.View.Focus();
                }
                catch (Exception)
                {
                    if (!output.IsDisposed) output.Close();
                    RunScript("report('Could not open the detached display.')");
                }
            }
        }

        internal void RunScript(string script)
        {
            if (!IsDisposed && !Disposing && View.CoreWebView2 != null) View.CoreWebView2.ExecuteScriptAsync(script);
        }

#if VERIFY
        internal void SetTestClip(string file) { clips.TestDestination = file; }
        internal DisplayWindow DetachedDisplay { get { return display; } }
#endif

        private async void OnMessage(object sender, CoreWebView2WebMessageReceivedEventArgs e)
        {
            if (!IsTrusted(e.Source)) return;
            try
            {
                var message = new JavaScriptSerializer { MaxJsonLength = 64 * 1024 * 1024 }.Deserialize<Dictionary<string, object>>(e.WebMessageAsJson);
                string action = (string)message["action"];
                switch (action)
                {
                    case "folder": await PickFolder((string)message["media"]); break;
                    case "googleSearch": await Google.Search((int)message["id"], (string)message["query"], (int)message["offset"]); break;
                    case "browseGoogle": await Google.Open((string)message["query"]); break;
                    case "save": await SaveFile((string)message["name"], (string)message["data"]); break;
                    case "finishClip": await clips.Save(); break;
                    case "shareClip": clips.Reveal(); break;
                    case "midi": midi.Choose(); break;
                    case "asioList": asio.List(); break;
                    case "asioOpen": asio.Open((string)message["driver"]); break;
                    case "asioChannels": asio.SelectChannels((int)message["left"], (int)message["right"]); break;
                    case "asioSettings": asio.ShowSettings(); break;
                    case "asioStop": asio.Stop(); break;
                    case "decodeVideoAudio": await DecodeVideoAudio(message, e); break;
                    case "releaseVideoAudio": Sources.ReleaseVideoAudio((string)message["url"]); break;
                    case "full": SetFullscreen((bool)message["value"]); break;
                    case "displayFullscreen": if (display != null) display.ToggleFullscreen(); break;
                    case "reattachDisplay": if (display != null) display.Close(); break;
                }
            }
            catch (Exception error)
            {
                RunScript("report(" + Json(error.Message) + ")");
            }
        }

        private async Task DecodeVideoAudio(Dictionary<string, object> message, CoreWebView2WebMessageReceivedEventArgs args)
        {
            var objects = args.AdditionalObjects;
            var file = objects != null && objects.Count == 1 ? objects[0] as CoreWebView2File : null;
            string url = null;
            try { url = await Sources.DecodeVideoAudio((string)message["source"], file == null ? null : file.Path); }
            catch (Exception) { /* The browser can restore the previous soundtrack. */ }
            RunScript("Mic.videoAudioDecoded(" + Json(message["id"]) + "," + Json(url) + ")");
        }

        private async Task PickFolder(string media)
        {
            string folder;
            using (var picker = new FolderBrowserDialog { Description = "Choose a folder of photos or videos", ShowNewFolderButton = false })
            {
                if (picker.ShowDialog(this) != DialogResult.OK) { RunScript("folderPicked([],'Folder selection cancelled.')"); return; }
                folder = picker.SelectedPath;
            }
            var items = await Task.Run(() => Sources.ReadFolder(folder, media));
            RunScript("folderPicked(" + Json(items) + ",'No supported files of the selected type in this folder.')");
        }

        private async Task SaveFile(string name, string data)
        {
            string extension = Path.GetExtension(name);
            if (extension != ".png" && extension != ".json") return;
            if (data.Length > 48 * 1024 * 1024) throw new IOException("This export is too large.");
            using (var picker = new SaveFileDialog { FileName = Path.GetFileName(name), Filter = extension == ".png" ? "PNG image|*.png" : "Session JSON|*.json" })
            {
                if (picker.ShowDialog(this) != DialogResult.OK) return;
                await Task.Run(() => File.WriteAllBytes(picker.FileName, Convert.FromBase64String(data)));
            }
            RunScript("report('Saved.')");
        }

    }
}


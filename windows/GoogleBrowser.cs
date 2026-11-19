using System;
using System.Collections.Generic;
using System.IO;
using System.Security.Cryptography;
using System.Threading.Tasks;
using System.Web.Script.Serialization;
using System.Windows.Forms;
using Microsoft.Web.WebView2.WinForms;

namespace TemporalLoom
{
    internal sealed class GoogleBrowser : IDisposable
    {
        private readonly LoomWindow app;
        private WebView2 browser;
        private Form window;
        private Task ready;
        private int active;
        internal readonly string Thumbs;

        internal GoogleBrowser(LoomWindow app)
        {
            this.app = app;
            Thumbs = Path.Combine(app.AppData, "Google thumbnails");
        }

        private Task Ensure() { return ready ?? (ready = Initialize()); }

        private async Task Initialize()
        {
            browser = new WebView2 { Dock = DockStyle.Fill };
            window = new Form { Text = "Google Images", Width = 980, Height = 680, ShowInTaskbar = false };
            window.Controls.Add(browser);
            window.FormClosing += (s, e) =>
            {
                if (e.CloseReason == CloseReason.UserClosing) { e.Cancel = true; window.Hide(); }
            };
            await browser.EnsureCoreWebView2Async(app.BrowserEnvironment);
            var core = browser.CoreWebView2;
            core.Settings.AreHostObjectsAllowed = false;
            core.Settings.IsWebMessageEnabled = false;
            core.Settings.AreDevToolsEnabled = false;
            core.NavigationStarting += (s, e) =>
            {
                Uri uri;
                if (!Uri.TryCreate(e.Uri, UriKind.Absolute, out uri) || uri.Scheme != "https" || uri.Host == "loom.invalid") e.Cancel = true;
            };
            core.NewWindowRequested += (s, e) => { e.Handled = true; if (e.IsUserInitiated) LoomWindow.OpenLink(e.Uri); };
            core.PermissionRequested += (s, e) => e.State = Microsoft.Web.WebView2.Core.CoreWebView2PermissionState.Deny;
        }

        private static string Url(string query, int offset)
        {
            return "https://www.google.com/search?udm=2&q=" + Uri.EscapeDataString(query) + "&start=" + offset;
        }

        internal async Task Open(string query)
        {
            await Ensure();
            if (browser.Source == null || browser.Source.AbsoluteUri == "about:blank") browser.CoreWebView2.Navigate(Url(query, 0));
            if (!window.Visible) window.Show(app);
            window.Activate();
        }

        internal async Task Search(int id, string query, int offset)
        {
            active = id;
            var items = new List<object>();
            string issue = "";
            try
            {
                await Ensure();
                if (active != id) return;
                browser.CoreWebView2.Navigate(Url(query, offset));
                for (int attempt = 0; attempt < 11; attempt++)
                {
                    await Task.Delay(attempt == 0 ? 1800 : 900);
                    if (active != id || app.IsDisposed) return;
                    string raw = await browser.CoreWebView2.ExecuteScriptAsync(ExtractImages);
                    if (raw == "null") continue;
                    var rows = new JavaScriptSerializer { MaxJsonLength = 6 * 1024 * 1024 }.Deserialize<Result[]>(raw);
                    foreach (var row in rows)
                    {
                        string image;
                        if (row.src.StartsWith("data:image/", StringComparison.Ordinal))
                        {
                            byte[] bytes = Convert.FromBase64String(row.src.Substring(row.src.IndexOf(',') + 1));
                            if (bytes.Length < 60 || bytes.Length > 180000) continue;
                            string hash;
                            using (var sha = SHA256.Create()) hash = BitConverter.ToString(sha.ComputeHash(bytes)).Replace("-", "").ToLowerInvariant();
                            Directory.CreateDirectory(Thumbs);
                            string file = Path.Combine(Thumbs, hash);
                            if (!File.Exists(file)) File.WriteAllBytes(file, bytes);
                            image = "/google-thumb/" + hash;
                        }
                        else if (row.src.StartsWith("https://", StringComparison.Ordinal)) image = "/web-image?url=" + Uri.EscapeDataString(row.src);
                        else continue;
                        string link = row.link.StartsWith("https://", StringComparison.Ordinal) ? row.link :
                            row.src.StartsWith("https://", StringComparison.Ordinal) ? row.src : Url(query, offset);
                        items.Add(new { image, link, title = row.title, source = "Google Images", date = "Web search" });
                    }
                    if (items.Count > 0) break;
                }
                if (items.Count == 0) issue = "Google returned no readable images. Open Google Images to check the results.";
            }
            catch (Exception) { issue = "Google Images unavailable."; }
            if (active == id) app.RunScript("googleResult(" + id + "," + LoomWindow.Json(items) + "," + LoomWindow.Json(issue) + ")");
        }

        private sealed class Result
        {
            public string src { get; set; }
            public string link { get; set; }
            public string title { get; set; }
        }

        private const string ExtractImages = @"(()=>{
          const out=[], seen=new Set();
          if(!location.pathname.startsWith('/search'))return out;
          for(const img of document.images){
            const src=img.currentSrc||img.src;
            if(!src||seen.has(src)||img.naturalWidth<65||img.naturalHeight<45||/googlelogo|branding|favicon/i.test(src))continue;
            const a=img.closest('a'); let link='',orig='';
            if(a){const u=new URL(a.href,location.href);link=u.searchParams.get('imgrefurl')||'';orig=u.searchParams.get('imgurl')||'';}
            if(!src.startsWith('https://')&&!/^data:image\/(jpeg|png|webp);base64,/i.test(src))continue;
            if(src.length>220000)continue;
            seen.add(src);out.push({src:orig.startsWith('https://')?orig:src,link,title:(img.alt||img.title||'Google Images result').slice(0,250)});
            if(out.length>=24)break;
          }
          return out;
        })()";

        public void Dispose()
        {
            active = -1;
            if (window != null) window.Dispose();
        }
    }
}

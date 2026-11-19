using System;
using System.Collections.Concurrent;
using System.Collections.Generic;
using System.IO;
using System.Linq;
using System.Net;
using System.Net.Http;
using System.Reflection;
using System.Text;
using System.Text.RegularExpressions;
using System.Threading.Tasks;
using System.Web;
using HtmlAgilityPack;
using Microsoft.Web.WebView2.Core;

namespace TemporalLoom
{
    internal sealed class Sources
    {
        private const int MiB = 1024 * 1024;
        private const int LocalSearchCandidates = 2048;
        private readonly LoomWindow app;
        private readonly ConcurrentDictionary<string, string> folderFiles = new ConcurrentDictionary<string, string>();
        private readonly HttpClient http = new HttpClient(new HttpClientHandler
        {
            AllowAutoRedirect = false, UseCookies = false, AutomaticDecompression = DecompressionMethods.Deflate | DecompressionMethods.GZip
        }) { Timeout = TimeSpan.FromSeconds(18) };
        private static readonly Dictionary<string, string> MediaTypes = new Dictionary<string, string>(StringComparer.OrdinalIgnoreCase)
        {
            { ".png", "image/png" }, { ".jpg", "image/jpeg" }, { ".jpeg", "image/jpeg" }, { ".gif", "image/gif" },
            { ".webp", "image/webp" }, { ".avif", "image/avif" }, { ".bmp", "image/bmp" },
            { ".mp4", "video/mp4" }, { ".m4v", "video/mp4" }, { ".mov", "video/quicktime" },
            { ".webm", "video/webm" }, { ".mkv", "video/x-matroska" }, { ".3gp", "video/3gpp" }
        };

        internal Sources(LoomWindow app)
        {
            this.app = app;
            http.DefaultRequestHeaders.UserAgent.ParseAdd("TemporalLoom/1.9 (Windows desktop visual instrument; https://temporal-loom-av.c4r3ful-cr34tur3.chatgpt.site/)");
        }

        internal object[] ReadFolder(string folder, string media = "both")
        {
            var candidates = new List<string>();
            var pending = new Queue<string>();
            var random = new Random();
            int seen = 0, folders = 0;
            pending.Enqueue(folder);
            while (pending.Count > 0 && folders++ < 500)
            {
                string dir = pending.Dequeue();
                try
                {
                    foreach (string child in Directory.EnumerateDirectories(dir))
                        if ((File.GetAttributes(child) & FileAttributes.ReparsePoint) == 0) pending.Enqueue(child);
                    foreach (string file in Directory.EnumerateFiles(dir))
                    {
                        string mime;
                        if (!MediaTypes.TryGetValue(Path.GetExtension(file), out mime)) continue;
                        bool video = mime.StartsWith("video/", StringComparison.Ordinal);
                        if (media == "photos" && video || media == "videos" && !video) continue;
                        int slot = random.Next(++seen);
                        if (candidates.Count < LocalSearchCandidates) candidates.Add(file);
                        else if (slot < LocalSearchCandidates) candidates[slot] = file;
                    }
                }
                catch (IOException) { }
                catch (UnauthorizedAccessException) { }
            }
            return candidates.OrderBy(file => random.Next()).Select(file =>
            {
                string key = Guid.NewGuid().ToString("N");
                folderFiles[key] = file;
                string mime = MediaTypes[Path.GetExtension(file)];
                return (object)new
                {
                    title = Path.GetFileName(file), date = "Local file", source = "Local file",
                    image = "/folder/" + key, kind = mime.StartsWith("video/") ? "video" : "image"
                };
            }).ToArray();
        }

        internal async void Request(object sender, CoreWebView2WebResourceRequestedEventArgs e)
        {
            using (var defer = e.GetDeferral())
            {
                try
                {
                    if (e.Request.Method != "GET" || !LoomWindow.IsTrusted(e.Request.Uri)) throw new IOException();
                    var url = new Uri(e.Request.Uri);
                    string range = e.Request.Headers.Contains("Range") ? e.Request.Headers.GetHeader("Range") : null;
                    var response = await Resolve(url, range);
                    e.Response = app.BrowserEnvironment.CreateWebResourceResponse(response.Body, response.Code, response.Reason, response.Headers);
                }
                catch (Exception)
                {
                    e.Response = app.BrowserEnvironment.CreateWebResourceResponse(new MemoryStream(), 502, "Unavailable", "Content-Type: text/plain\r\n");
                }
            }
        }

        private async Task<Payload> Resolve(Uri url, string range)
        {
            string path = url.AbsolutePath;
            if (path == "/" || path == "/archive.js")
            {
                bool html = path == "/";
                var stream = Assembly.GetExecutingAssembly().GetManifestResourceStream(html ? "index.html" : "archive.js");
                return new Payload(stream, html ? "text/html; charset=utf-8" : "text/javascript; charset=utf-8");
            }
            if (path == "/thesaurus.json")
                return new Payload(Assembly.GetExecutingAssembly().GetManifestResourceStream("thesaurus.json"), "application/json; charset=utf-8");
            if (Regex.IsMatch(path, @"\A/type-fonts/(catalog\.css|[0-9a-f]{20}\.woff2)\z"))
            {
                bool css = path.EndsWith(".css", StringComparison.Ordinal);
                string file = Path.Combine(AppDomain.CurrentDomain.BaseDirectory, "type-fonts", Path.GetFileName(path));
                return new Payload(File.OpenRead(file), css ? "text/css; charset=utf-8" : "font/woff2");
            }
            if (path.StartsWith("/google-thumb/"))
            {
                string hash = path.Substring("/google-thumb/".Length);
                if (!Regex.IsMatch(hash, "^[a-f0-9]{64}$")) throw new FileNotFoundException();
                return new Payload(File.OpenRead(Path.Combine(app.Google.Thumbs, hash)), "image/jpeg");
            }
            if (path.StartsWith("/folder/"))
            {
                string local;
                if (!folderFiles.TryGetValue(path.Substring("/folder/".Length), out local)) throw new FileNotFoundException();
                return OpenLocal(local, range);
            }
            var p = HttpUtility.ParseQueryString(url.Query);
            if (path == "/website") return await Website(p["url"], p["media"] ?? (p["video"] == "1" ? "both" : "photos"));
            if (path == "/web-video") return await Video(p["url"], range);
            bool json = path == "/relay", sound = path == "/field-audio", websiteImage = path == "/web-image";
            string target = p["url"];
            if (path == "/api/image") target = ArchiveImage(p["kind"], p["id"], p["timestamp"], target);
            else if (sound)
            {
                if (target == null || !Regex.IsMatch(target, @"^https://archive\.org/download/aporee_[0-9]+_[0-9]+/[^/]+$")) throw new IOException();
            }
            else if (!json && !websiteImage) throw new FileNotFoundException();

            var remote = await Fetch(target, sound ? 48 * MiB : 8 * MiB, uri => websiteImage || ArchiveHost(uri, json));
            if (json) return new Payload(new MemoryStream(remote.Bytes), "application/json; charset=utf-8");
            if (sound && (remote.Mime.StartsWith("audio/") || remote.Mime == "application/octet-stream"))
                return new Payload(new MemoryStream(remote.Bytes), "audio/mpeg");
            if (!sound && IsRaster(remote.Mime) && !Regex.IsMatch(remote.Uri.AbsolutePath, @"/(?:images/(?:notfound\.png|glogo\.(?:jpg|png))|favicon\.ico)$", RegexOptions.IgnoreCase))
                return new Payload(new MemoryStream(remote.Bytes), remote.Mime);
            throw new IOException();
        }

        private static bool ArchiveHost(Uri uri, bool json)
        {
            return uri.Host == "archive.org" || uri.Host.EndsWith(".archive.org", StringComparison.Ordinal) ||
                (json && ((uri.Host == "en.wikipedia.org" || uri.Host == "commons.wikimedia.org") && uri.AbsolutePath == "/w/api.php" ||
                    uri.Host == "images-api.nasa.gov" && (uri.AbsolutePath == "/search" || uri.AbsolutePath.StartsWith("/asset/", StringComparison.Ordinal)) ||
                    (uri.Host == "video.blender.org" || uri.Host == "peertube.tv" || uri.Host == "tilvids.com" || uri.Host == "fedi.video" ||
                        uri.Host == "diode.zone" || uri.Host == "makertube.net" || uri.Host == "video.hardlimit.com") &&
                    (uri.AbsolutePath == "/api/v1/search/videos" || uri.AbsolutePath.StartsWith("/api/v1/videos/", StringComparison.Ordinal))));
        }

        private static string ArchiveImage(string kind, string id, string time, string original)
        {
            if (kind == "ia" && id != null && Regex.IsMatch(id, @"^[A-Za-z0-9_.-]{1,200}$"))
                return "https://archive.org/services/img/" + id;
            Uri link;
            if (kind == "wayback" && time != null && Regex.IsMatch(time, @"^\d{14}$") &&
                Uri.TryCreate(original, UriKind.Absolute, out link) && (link.Scheme == "https" || link.Scheme == "http"))
                return "https://web.archive.org/web/" + time + "im_/" + link.AbsoluteUri;
            throw new IOException();
        }

        private static bool IsRaster(string mime)
        {
            return Regex.IsMatch(mime, @"^image/(jpeg|png|gif|webp|avif|bmp)$", RegexOptions.IgnoreCase);
        }

        private static string VideoMime(string type, Uri uri)
        {
            if (type == "video/mp4" || type == "video/webm") return type;
            if (type.Length > 0 && type != "application/octet-stream") return null;
            if (uri.AbsolutePath.EndsWith(".mp4", StringComparison.OrdinalIgnoreCase)) return "video/mp4";
            if (uri.AbsolutePath.EndsWith(".webm", StringComparison.OrdinalIgnoreCase)) return "video/webm";
            return null;
        }

        private async Task<Payload> Website(string target, string media)
        {
            bool video = media == "videos" || media == "both", photo = media != "videos";
            var data = await Fetch(target, 8 * MiB, uri => true, video);
            var items = new Dictionary<string, string>(StringComparer.Ordinal);
            var clips = new Dictionary<string, string>(StringComparer.Ordinal);
            if (video && VideoMime(data.Mime, data.Uri) != null) clips.Add(data.Uri.AbsoluteUri, Path.GetFileName(data.Uri.AbsolutePath));
            else if (IsRaster(data.Mime))
            {
                if (photo) items.Add(data.Uri.AbsoluteUri, Path.GetFileName(data.Uri.AbsolutePath));
            }
            else if (data.Mime == "text/html" || data.Mime == "application/xhtml+xml")
            {
                var html = new HtmlDocument();
                html.LoadHtml(Encoding.UTF8.GetString(data.Bytes));
                string selection = "//a[@href]";
                if (photo) selection += " | //img | //meta[@property='og:image']";
                if (video) selection += " | //video[@src] | //video/source[@src]";
                var nodes = html.DocumentNode.SelectNodes(selection);
                if (nodes != null) foreach (var node in nodes)
                {
                    string attribute = node.Name == "meta" ? "content" : node.Name == "a" ? "href" : "src";
                    string value = node.GetAttributeValue(attribute, "");
                    if (node.Name == "img") value = node.GetAttributeValue("data-src", node.GetAttributeValue("data-original", value));
                    Uri uri;
                    if (string.IsNullOrWhiteSpace(value) || !Uri.TryCreate(data.Uri, HtmlEntity.DeEntitize(value), out uri) || uri.Scheme != "https") continue;
                    if (video && (node.Name == "video" || node.Name == "source" || VideoMime("", uri) != null))
                    {
                        if (clips.Count < 2048 && !clips.ContainsKey(uri.AbsoluteUri)) clips.Add(uri.AbsoluteUri, Path.GetFileName(uri.AbsolutePath));
                        continue;
                    }
                    if (!photo || (node.Name == "a" && !Regex.IsMatch(uri.AbsolutePath, @"\.(jpg|jpeg|png|gif|webp|avif)$", RegexOptions.IgnoreCase))) continue;
                    if (items.Count < 2048 && !items.ContainsKey(uri.AbsoluteUri)) items.Add(uri.AbsoluteUri, node.GetAttributeValue("alt", Path.GetFileName(uri.AbsolutePath)));
                }
            }
            else throw new IOException();
            var random = new Random();
            var photos = items.OrderBy(entry => random.Next()).ToArray();
            var videos = clips.OrderBy(entry => random.Next()).ToArray();
            var result = new List<object>();
            for (int index = 0; index < Math.Max(photos.Length, videos.Length); index++)
            {
                if (index < videos.Length) result.Add(WebsiteItem(videos[index], true));
                if (index < photos.Length) result.Add(WebsiteItem(photos[index], false));
            }
            return new Payload(new MemoryStream(Encoding.UTF8.GetBytes(LoomWindow.Json(result))), "application/json; charset=utf-8");
        }

        private static object WebsiteItem(KeyValuePair<string,string> entry, bool clip)
        {
            return new {
                source = "Website", date = "Live website", title = entry.Value, link = entry.Key, kind = clip ? "video" : "image",
                image = (clip ? "/web-video?url=" : "/web-image?url=") + Uri.EscapeDataString(entry.Key)
            };
        }

        private sealed class Remote
        {
            internal Uri Uri;
            internal string Mime;
            internal byte[] Bytes;
        }

        private async Task<Remote> Fetch(string target, int limit, Func<Uri, bool> allowed, bool detectVideo = false)
        {
            Uri uri;
            if (!Uri.TryCreate(target, UriKind.Absolute, out uri)) throw new IOException();
            for (int hop = 0; hop < 6; hop++)
            {
                if (uri.Scheme != "https" || uri.UserInfo.Length > 0 || !allowed(uri)) throw new IOException();
                using (var deadline = new System.Threading.CancellationTokenSource(TimeSpan.FromSeconds(18)))
                using (var response = await http.GetAsync(uri, HttpCompletionOption.ResponseHeadersRead, deadline.Token))
                {
                    int status = (int)response.StatusCode;
                    if (status >= 300 && status < 400 && response.Headers.Location != null)
                    {
                        uri = new Uri(uri, response.Headers.Location);
                        continue;
                    }
                    response.EnsureSuccessStatusCode();
                    string mime = response.Content.Headers.ContentType == null ? "" : response.Content.Headers.ContentType.MediaType;
                    if (detectVideo && VideoMime(mime, uri) != null) return new Remote { Uri = uri, Mime = mime };
                    if (response.Content.Headers.ContentLength > limit) throw new IOException();
                    using (var input = await response.Content.ReadAsStreamAsync())
                    using (var output = new MemoryStream())
                    {
                        byte[] buffer = new byte[32768];
                        int count;
                        while ((count = await input.ReadAsync(buffer, 0, buffer.Length, deadline.Token)) > 0)
                        {
                            if (output.Length + count > limit) throw new IOException();
                            output.Write(buffer, 0, count);
                        }
                        return new Remote { Uri = uri, Mime = mime, Bytes = output.ToArray() };
                    }
                }
            }
            throw new IOException("Too many redirects.");
        }

        private async Task<Payload> Video(string target, string range)
        {
            Uri uri;
            if (!Uri.TryCreate(target, UriKind.Absolute, out uri)) throw new IOException();
            for (int hop = 0; hop < 6; hop++)
            {
                if (uri.Scheme != "https" || uri.UserInfo.Length > 0) throw new IOException();
                using (var request = new HttpRequestMessage(HttpMethod.Get, uri))
                using (var deadline = new System.Threading.CancellationTokenSource(TimeSpan.FromSeconds(18)))
                {
                    request.Headers.TryAddWithoutValidation("Accept-Encoding", "identity");
                    if (range != null && Regex.IsMatch(range, @"^bytes=(\d+-\d*|-\d+)$"))
                        request.Headers.TryAddWithoutValidation("Range", range);
                    var response = await http.SendAsync(request, HttpCompletionOption.ResponseHeadersRead, deadline.Token);
                    bool ownsBody = false;
                    try
                    {
                        int status = (int)response.StatusCode;
                        if (status >= 300 && status < 400 && response.Headers.Location != null)
                        {
                            uri = new Uri(uri, response.Headers.Location);
                            continue;
                        }
                        if (status != 200 && status != 206) throw new IOException("Video server returned " + status);
                        var headers = response.Content.Headers;
                        string mime = VideoMime(headers.ContentType == null ? "" : headers.ContentType.MediaType, uri);
                        if (mime == null) throw new IOException("Unsupported video format.");
                        string forwarded = headers.ContentRange == null ? "" : "Content-Range: " + headers.ContentRange + "\r\n";
                        if (headers.ContentLength.HasValue) forwarded += "Content-Length: " + headers.ContentLength + "\r\n";
                        if (status == 206 || response.Headers.AcceptRanges.Contains("bytes")) forwarded += "Accept-Ranges: bytes\r\n";
                        var body = new VideoBody(await response.Content.ReadAsStreamAsync(), response);
                        ownsBody = true;
                        return new Payload(body, mime, status, status == 206 ? "Partial Content" : "OK", forwarded);
                    }
                    finally { if (!ownsBody) response.Dispose(); }
                }
            }
            throw new IOException("Too many video redirects.");
        }

        private sealed class VideoBody : Stream
        {
            private readonly Stream input;
            private readonly HttpResponseMessage response;
            internal VideoBody(Stream input, HttpResponseMessage response){this.input=input;this.response=response;}
            public override bool CanRead { get { return true; } }
            public override bool CanSeek { get { return false; } }
            public override bool CanWrite { get { return false; } }
            public override long Length { get { return response.Content.Headers.ContentLength ?? throwNotSupported(); } }
            private static long throwNotSupported() { throw new NotSupportedException(); }
            public override long Position { get { throw new NotSupportedException(); } set { throw new NotSupportedException(); } }
            public override int Read(byte[] buffer, int offset, int length)
            {
                using (var deadline = new System.Threading.CancellationTokenSource(TimeSpan.FromSeconds(15)))
                    return input.ReadAsync(buffer, offset, length, deadline.Token).GetAwaiter().GetResult();
            }
            public override void Flush() { }
            public override long Seek(long offset, SeekOrigin origin) { throw new NotSupportedException(); }
            public override void SetLength(long length) { throw new NotSupportedException(); }
            public override void Write(byte[] buffer, int offset, int length) { throw new NotSupportedException(); }
            protected override void Dispose(bool disposing) { if (disposing) response.Dispose(); base.Dispose(disposing); }
        }

        private static Payload OpenLocal(string file, string range)
        {
            var input = File.Open(file, FileMode.Open, FileAccess.Read, FileShare.Read);
            string mime = MediaTypes[Path.GetExtension(file)];
            long length = input.Length, start = 0, end = length - 1;
            if (!string.IsNullOrEmpty(range))
            {
                var match = Regex.Match(range, @"^bytes=(\d*)-(\d*)$");
                long first, last;
                bool valid = match.Success && (match.Groups[1].Length > 0 || match.Groups[2].Length > 0);
                if (valid && long.TryParse(match.Groups[1].Value, out first))
                {
                    start = first;
                    if (long.TryParse(match.Groups[2].Value, out last)) end = Math.Min(end, last);
                }
                else if (valid && long.TryParse(match.Groups[2].Value, out last)) start = Math.Max(0, length - last);
                else valid = false;
                if (!valid || start > end)
                {
                    input.Dispose();
                    return new Payload(new MemoryStream(), mime, 416, "Range Not Satisfiable", "Content-Range: bytes */" + length + "\r\n");
                }
            }
            long count = end - start + 1;
            bool partial = !string.IsNullOrEmpty(range);
            string headers = "Accept-Ranges: bytes\r\nContent-Length: " + count + "\r\n" +
                (partial ? "Content-Range: bytes " + start + "-" + end + "/" + length + "\r\n" : "");
            return new Payload(new SliceStream(input, start, count), mime, partial ? 206 : 200, partial ? "Partial Content" : "OK", headers);
        }

        private sealed class Payload
        {
            internal readonly Stream Body;
            internal readonly int Code;
            internal readonly string Headers, Reason;
            internal Payload(Stream body, string type, int code = 200, string reason = "OK", string extra = "")
            {
                Body = body; Code = code; Reason = reason;
                Headers = "Content-Type: " + type + "\r\nX-Content-Type-Options: nosniff\r\n" + extra;
            }
        }

        private sealed class SliceStream : Stream
        {
            private readonly FileStream input;
            private readonly long start, length;
            internal SliceStream(FileStream input, long start, long length)
            { this.input = input; this.start = start; this.length = length; input.Position = start; }
            public override bool CanRead { get { return true; } }
            public override bool CanSeek { get { return true; } }
            public override bool CanWrite { get { return false; } }
            public override long Length { get { return length; } }
            public override long Position { get { return input.Position - start; } set { Seek(value, SeekOrigin.Begin); } }
            public override int Read(byte[] b, int index, int count) { return input.Read(b, index, (int)Math.Min(count, Math.Max(0, length - Position))); }
            public override long Seek(long offset, SeekOrigin origin)
            {
                long position = origin == SeekOrigin.Begin ? offset : origin == SeekOrigin.End ? length + offset : Position + offset;
                if (position < 0) throw new IOException();
                input.Position = start + position;
                return position;
            }
            public override void SetLength(long value) { throw new NotSupportedException(); }
            public override void Write(byte[] b, int i, int count) { throw new NotSupportedException(); }
            public override void Flush() { }
            protected override void Dispose(bool disposing) { if (disposing) input.Dispose(); base.Dispose(disposing); }
        }
    }
}

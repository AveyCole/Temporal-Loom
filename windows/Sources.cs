using System;
using System.Collections.Concurrent;
using System.Collections.Generic;
using System.Diagnostics;
using System.IO;
using System.Linq;
using System.Net;
using System.Net.Http;
using System.Net.Http.Headers;
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
        // WebView2 can buffer an entire intercepted response before delivering it to the player.
        internal const int MediaChunkBytes = 4 * MiB;
        private const long MaxWebVideoBytes = 512L * MiB;
        private const int LocalSearchCandidates = 2048;
        private readonly LoomWindow app;
        private readonly ConcurrentDictionary<string, string> folderFiles = new ConcurrentDictionary<string, string>();
        private readonly ConcurrentDictionary<string, string> decodedAudio = new ConcurrentDictionary<string, string>();
        private readonly System.Threading.SemaphoreSlim audioDecoder = new System.Threading.SemaphoreSlim(1);
        private volatile bool closing;
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
            if (path.StartsWith("/decoded-audio/", StringComparison.Ordinal))
            {
                string local;
                if (!decodedAudio.TryGetValue(path, out local)) throw new FileNotFoundException();
                return OpenLocal(local, range, "audio/mpeg");
            }
            var p = HttpUtility.ParseQueryString(url.Query);
            if (path == "/website") return await Website(p["url"], p["media"] ?? (p["video"] == "1" ? "both" : "photos"));
            if (path == "/web-video" || path == "/web-audio") return await Video(p["url"], range, path == "/web-audio");
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
                    using (var body = await ReadBounded(response.Content, limit, deadline.Token))
                        return new Remote { Uri = uri, Mime = mime, Bytes = body.ToArray() };
                }
            }
            throw new IOException("Too many redirects.");
        }

        private async Task<Payload> Video(string target, string range, bool audio)
        {
            Uri uri;
            if (!Uri.TryCreate(target, UriKind.Absolute, out uri)) throw new IOException();
            RangeHeaderValue requested = BoundedMediaRange(range);
            for (int hop = 0; hop < 6; hop++)
            {
                if (uri.Scheme != "https" || uri.UserInfo.Length > 0) throw new IOException();
                using (var request = new HttpRequestMessage(HttpMethod.Get, uri))
                using (var deadline = new System.Threading.CancellationTokenSource(TimeSpan.FromSeconds(18)))
                {
                    request.Headers.TryAddWithoutValidation("Accept-Encoding", "identity");
                    request.Headers.Range = requested;
                    using (var response = await http.SendAsync(request, HttpCompletionOption.ResponseHeadersRead, deadline.Token))
                    {
                        int status = (int)response.StatusCode;
                        if (status >= 300 && status < 400 && response.Headers.Location != null)
                        {
                            uri = new Uri(uri, response.Headers.Location);
                            continue;
                        }
                        return await ReadMediaResponse(response, uri, audio, deadline.Token);
                    }
                }
            }
            throw new IOException("Too many video redirects.");
        }

        internal static async Task<Payload> ReadMediaResponse(HttpResponseMessage response, Uri uri, bool audio,
            System.Threading.CancellationToken token)
        {
            int status = (int)response.StatusCode;
            if (status != 200 && status != 206) throw new IOException("Media server returned " + status);
            var headers = response.Content.Headers;
            string contentType = headers.ContentType == null ? "" : headers.ContentType.MediaType;
            string mime = audio ? AudioMime(contentType, uri) : VideoMime(contentType, uri);
            if (mime == null) throw new IOException("Unsupported media format.");
            var span = headers.ContentRange;
            long? expected = headers.ContentLength;
            long? total = expected;
            string forwarded = "";
            if (status == 206)
            {
                if (span == null || span.Unit != "bytes" || !span.HasRange || !span.HasLength ||
                    span.To < span.From || span.To >= span.Length || span.To - span.From >= MediaChunkBytes)
                    throw new IOException("Invalid media range.");
                expected = span.To - span.From + 1;
                total = span.Length;
                forwarded = "Content-Range: " + span + "\r\nAccept-Ranges: bytes\r\n";
            }
            if (!audio && total > MaxWebVideoBytes)
                throw new IOException("Online videos must be 512 MiB or smaller.");
            if (expected > MediaChunkBytes) throw new IOException("Media server did not send a bounded response.");
            var body = await ReadBounded(response.Content, MediaChunkBytes, token);
            if (expected.HasValue && body.Length != expected.Value)
            {
                body.Dispose();
                throw new IOException("Incomplete media response.");
            }
            forwarded += "Content-Length: " + body.Length + "\r\n";
            return new Payload(body, mime, status, status == 206 ? "Partial Content" : "OK", forwarded);
        }

        internal static RangeHeaderValue BoundedMediaRange(string range)
        {
            RangeHeaderValue parsed;
            if (string.IsNullOrEmpty(range)) return new RangeHeaderValue(0, MediaChunkBytes - 1);
            if (!RangeHeaderValue.TryParse(range, out parsed) || !string.Equals(parsed.Unit, "bytes", StringComparison.OrdinalIgnoreCase) || parsed.Ranges.Count != 1)
                throw new IOException("Invalid media range.");
            var item = parsed.Ranges.Single();
            if (!item.From.HasValue) return new RangeHeaderValue(null, Math.Min(item.To.Value, MediaChunkBytes));
            long start = item.From.Value;
            return new RangeHeaderValue(start, BoundedMediaEnd(start, item.To ?? long.MaxValue));
        }

        private static long BoundedMediaEnd(long start, long end)
        {
            return start + Math.Min(end - start, MediaChunkBytes - 1);
        }

        private static async Task<MemoryStream> ReadBounded(HttpContent content, int limit, System.Threading.CancellationToken token)
        {
            if (content.Headers.ContentLength > limit) throw new IOException("Response exceeds its size limit.");
            using (var input = await content.ReadAsStreamAsync())
            {
                var output = new MemoryStream((int)(content.Headers.ContentLength ?? 0));
                try
                {
                    var buffer = new byte[32768];
                    int count;
                    while ((count = await input.ReadAsync(buffer, 0, buffer.Length, token)) > 0)
                    {
                        if (output.Length + count > limit) throw new IOException("Response exceeds its size limit.");
                        output.Write(buffer, 0, count);
                    }
                    output.Position = 0;
                    return output;
                }
                catch { output.Dispose(); throw; }
            }
        }

        private static string AudioMime(string type, Uri uri)
        {
            if (Regex.IsMatch(type, @"^audio/(mp4|mpeg|webm|aac|ogg|opus)$")) return type;
            if (type.Length == 0 || type == "application/octet-stream")
            {
                switch (Path.GetExtension(uri.AbsolutePath).ToLowerInvariant())
                {
                    case ".m4a": return "audio/mp4";
                    case ".mp3": return "audio/mpeg";
                    case ".aac": return "audio/aac";
                    case ".ogg":
                    case ".opus": return "audio/ogg";
                }
            }
            return VideoMime(type, uri);
        }

        internal async Task<string> DecodeVideoAudio(string source, string path)
        {
            if (path == null && source != null && source.StartsWith("/folder/", StringComparison.Ordinal))
                folderFiles.TryGetValue(source.Substring("/folder/".Length), out path);
            if (string.IsNullOrEmpty(path) || !File.Exists(path) || closing) return null;
            string key = Guid.NewGuid().ToString("N");
            string output = Path.Combine(Path.GetTempPath(), "TemporalLoom-audio-" + key + ".mp3");
            string url = "/decoded-audio/" + key;
            await audioDecoder.WaitAsync();
            try
            {
                if (closing) return null;
                bool success = await Task.Run(() => ConvertVideoAudio(path, output));
                if (!success || closing) return null;
                decodedAudio[url] = output;
                return url;
            }
            finally
            {
                audioDecoder.Release();
                if (!decodedAudio.ContainsKey(url)) DeleteSoundtrack(output);
            }
        }

        private static bool ConvertVideoAudio(string input, string output)
        {
            var executable = Path.Combine(AppDomain.CurrentDomain.BaseDirectory, "ffmpeg.exe");
            var arguments = "-hide_banner -loglevel error -nostdin -protocol_whitelist file -i \"" + input +
                "\" -map 0:a:0 -vn -ac 2 -c:a libmp3lame -b:a 160k -y \"" + output + "\"";
            using (var process = Process.Start(new ProcessStartInfo(executable, arguments)
            {
                UseShellExecute = false, CreateNoWindow = true
            }))
            {
                if (!process.WaitForExit(55000))
                {
                    try { process.Kill(); }
                    catch (InvalidOperationException) { }
                    process.WaitForExit();
                    return false;
                }
                return process.ExitCode == 0 && File.Exists(output) && new FileInfo(output).Length > 0;
            }
        }

        internal void ReleaseVideoAudio(string url)
        {
            string file;
            if (decodedAudio.TryRemove(url, out file)) DeleteSoundtrack(file);
        }

        internal void CloseVideoAudio()
        {
            closing = true;
            foreach (string url in decodedAudio.Keys) ReleaseVideoAudio(url);
        }

        private static void DeleteSoundtrack(string file)
        {
            try { File.Delete(file); }
            catch (IOException) { }
            catch (UnauthorizedAccessException) { }
        }

        private static Payload OpenLocal(string file, string range, string mime = null)
        {
            var input = File.Open(file, FileMode.Open, FileAccess.Read, FileShare.Read | FileShare.Delete);
            if (mime == null) mime = MediaTypes[Path.GetExtension(file)];
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
                else if (valid && long.TryParse(match.Groups[2].Value, out last)) start = Math.Max(0, length - Math.Min(last, MediaChunkBytes));
                else valid = false;
                if (!valid || start > end)
                {
                    input.Dispose();
                    return new Payload(new MemoryStream(), mime, 416, "Range Not Satisfiable", "Content-Range: bytes */" + length + "\r\n");
                }
            }
            end = BoundedMediaEnd(start, end);
            long count = end - start + 1;
            bool partial = count < length || !string.IsNullOrEmpty(range);
            string headers = "Accept-Ranges: bytes\r\nContent-Length: " + count + "\r\n" +
                (partial ? "Content-Range: bytes " + start + "-" + end + "/" + length + "\r\n" : "");
            return new Payload(new SliceStream(input, start, count), mime, partial ? 206 : 200, partial ? "Partial Content" : "OK", headers);
        }

        internal sealed class Payload
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

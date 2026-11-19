using System;
using System.Drawing;
using System.Reflection;
using System.Runtime.InteropServices;
using System.Windows.Forms;
using Microsoft.Web.WebView2.Core;
using Microsoft.Web.WebView2.WinForms;

namespace TemporalLoom
{
    internal class PerformanceWindow : Form
    {
        private FormWindowState previousState;
        private Rectangle previousBounds;
        internal bool IsFullscreen { get; private set; }
        internal Rectangle WindowedBounds
        {
            get { return IsFullscreen ? previousBounds : (WindowState == FormWindowState.Normal ? Bounds : RestoreBounds); }
        }

        protected PerformanceWindow(bool keepFullscreenOnTop = false)
        {
            Activated += (sender, e) => { if (IsFullscreen) PromoteFullscreen(); };
            Deactivate += (sender, e) => { if (IsFullscreen && !keepFullscreenOnTop) TopMost = false; };
        }

        internal void SetFullscreen(bool active)
        {
            if (active == IsFullscreen) return;
            if (active)
            {
                var display = Screen.FromControl(this).Bounds;
                previousState = WindowState;
                previousBounds = WindowedBounds;
                WindowState = FormWindowState.Normal;
                FormBorderStyle = FormBorderStyle.None;
                Bounds = display;
                IsFullscreen = true;
                PromoteFullscreen();
            }
            else
            {
                IsFullscreen = false;
                MarkShellFullscreen(false);
                TopMost = false;
                FormBorderStyle = FormBorderStyle.Sizable;
                Bounds = previousBounds;
                WindowState = previousState;
            }
        }

        private void PromoteFullscreen()
        {
            TopMost = true;
            MarkShellFullscreen(true);
        }

        private void MarkShellFullscreen(bool enabled)
        {
            object shell = null;
            try
            {
                shell = new TaskbarList();
                var taskbar = (ITaskbarList2)shell;
                taskbar.HrInit();
                taskbar.MarkFullscreenWindow(Handle, enabled);
            }
            catch (COMException) { /* The borderless window still covers the display without Explorer. */ }
            finally { if (shell != null) Marshal.ReleaseComObject(shell); }
        }

        [ComImport, Guid("56FDF344-FD6D-11D0-958A-006097C9A090")]
        private class TaskbarList { }

        [ComImport, Guid("602D4995-B13A-429B-A66E-1935E44F4317"), InterfaceType(ComInterfaceType.InterfaceIsIUnknown)]
        private interface ITaskbarList2
        {
            void HrInit();
            void AddTab(IntPtr hwnd);
            void DeleteTab(IntPtr hwnd);
            void ActivateTab(IntPtr hwnd);
            void SetActiveAlt(IntPtr hwnd);
            void MarkFullscreenWindow(IntPtr hwnd, [MarshalAs(UnmanagedType.Bool)] bool fullscreen);
        }
    }

    internal sealed class DisplayWindow : PerformanceWindow
    {
        internal const string Page = LoomWindow.Origin + "/display";
        internal readonly WebView2 View = new WebView2 { Dock = DockStyle.Fill };

        internal DisplayWindow(LoomWindow controls, Rectangle lastBounds) : base(true)
        {
            Text = "Temporal Loom Display";
            Icon = controls.Icon;
            BackColor = Color.Black;
            MinimumSize = new Size(320, 240);
            StartPosition = FormStartPosition.Manual;
            var screen = Screen.FromControl(controls);
            var other = Array.Find(Screen.AllScreens, candidate => candidate.DeviceName != screen.DeviceName);
            var area = (other ?? screen).WorkingArea;
            if (Array.Exists(Screen.AllScreens, candidate => candidate.WorkingArea.Contains(lastBounds) && !lastBounds.IsEmpty))
            {
                Bounds = lastBounds;
            }
            else
            {
                var size = new Size(Math.Min(area.Width * 3 / 4, 1000), Math.Min(area.Height * 3 / 4, 680));
                Bounds = new Rectangle(area.X + (area.Width - size.Width) / 2, area.Y + (area.Height - size.Height) / 2, size.Width, size.Height);
            }
            Controls.Add(View);
        }

        internal void ConfigureBrowser()
        {
            var core = View.CoreWebView2;
            core.Settings.AreDevToolsEnabled = false;
            core.Settings.AreDefaultContextMenusEnabled = false;
            core.Settings.AreHostObjectsAllowed = false;
            core.Settings.IsStatusBarEnabled = false;
            core.Settings.IsZoomControlEnabled = false;
            core.NavigationStarting += (sender, e) => { e.Cancel = e.Uri != Page; };
            core.NewWindowRequested += (sender, e) => { e.Handled = true; };
            core.WindowCloseRequested += (sender, e) => Close();
            core.WebMessageReceived += (sender, e) =>
            {
                if (e.Source != Page) return;
                var message = e.TryGetWebMessageAsString();
                if (message == "toggleFullscreen") ToggleFullscreen();
                if (message == "exitFullscreen" && IsFullscreen) ToggleFullscreen();
            };
        }

        internal void ServePage(CoreWebView2Environment environment)
        {
            var core = View.CoreWebView2;
            core.AddWebResourceRequestedFilter(Page, CoreWebView2WebResourceContext.Document, CoreWebView2WebResourceRequestSourceKinds.All);
            core.WebResourceRequested += (sender, e) =>
            {
                var stream = Assembly.GetExecutingAssembly().GetManifestResourceStream("display.html");
                e.Response = environment.CreateWebResourceResponse(stream, 200, "OK", "Content-Type: text/html; charset=utf-8\r\n");
            };
        }

        internal void ToggleFullscreen()
        {
            SetFullscreen(!IsFullscreen);
            View.CoreWebView2.ExecuteScriptAsync("document.documentElement.classList.toggle('fullscreen'," + (IsFullscreen ? "true" : "false") + ")");
        }
    }
}

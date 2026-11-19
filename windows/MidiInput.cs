using System;
using System.Drawing;
using System.Runtime.InteropServices;
using System.Windows.Forms;

namespace TemporalLoom
{
    internal sealed class MidiInput : IDisposable
    {
        private readonly LoomWindow app;
        private readonly MidiCallback callback;
        private IntPtr handle;

        internal MidiInput(LoomWindow app) { this.app = app; callback = Receive; }

        internal void Choose()
        {
            var menu = new ContextMenuStrip();
            for (uint index = 0; index < midiInGetNumDevs(); index++)
            {
                uint selected = index;
                MidiCaps caps;
                string name = midiInGetDevCaps(new UIntPtr(index), out caps, (uint)Marshal.SizeOf(typeof(MidiCaps))) == 0
                    ? caps.Name : "MIDI input " + (index + 1);
                menu.Items.Add(name, null, (sender,e) => Connect(selected, name));
            }
            if (menu.Items.Count == 0)
            {
                menu.Dispose();
                app.RunScript("report('Connect a Windows MIDI input and try again.')");
                return;
            }
            menu.Closed += (s, e) => menu.Dispose();
            menu.Show(Cursor.Position);
        }

        private void Connect(uint index, string name)
        {
            Dispose();
            if (midiInOpen(out handle, index, callback, IntPtr.Zero, 0x30000) != 0 || midiInStart(handle) != 0)
            {
                Dispose();
                app.RunScript("report('Could not open MIDI input.')");
                return;
            }
            app.RunScript("nativeMidiReady();document.getElementById('midiDevices').options[0].text=" + LoomWindow.Json(name));
        }

        private void Receive(IntPtr device, uint message, IntPtr instance, UIntPtr packed, UIntPtr timestamp)
        {
            if (message != 0x3c3 || app.IsDisposed || !app.IsHandleCreated) return;
            uint data = packed.ToUInt32();
            int command = (int)(data & 255), note = (int)((data >> 8) & 127), value = (int)((data >> 16) & 127);
            try { app.BeginInvoke((Action)(() => app.RunScript("nativeNote(" + command + "," + note + "," + value + ")"))); }
            catch (InvalidOperationException) { }
        }

        public void Dispose()
        {
            if (handle == IntPtr.Zero) return;
            midiInStop(handle); midiInReset(handle); midiInClose(handle);
            handle = IntPtr.Zero;
        }

        [StructLayout(LayoutKind.Sequential, CharSet = CharSet.Unicode)]
        private struct MidiCaps
        {
            public ushort Manufacturer, Product;
            public uint Version;
            [MarshalAs(UnmanagedType.ByValTStr, SizeConst = 32)] public string Name;
            public uint Support;
        }

        private delegate void MidiCallback(IntPtr device, uint message, IntPtr instance, UIntPtr packed, UIntPtr timestamp);
        [DllImport("winmm.dll")] private static extern uint midiInGetNumDevs();
        [DllImport("winmm.dll", CharSet = CharSet.Unicode)] private static extern uint midiInGetDevCaps(UIntPtr id, out MidiCaps caps, uint size);
        [DllImport("winmm.dll")] private static extern uint midiInOpen(out IntPtr handle, uint id, MidiCallback callback, IntPtr instance, uint flags);
        [DllImport("winmm.dll")] private static extern uint midiInStart(IntPtr handle);
        [DllImport("winmm.dll")] private static extern uint midiInStop(IntPtr handle);
        [DllImport("winmm.dll")] private static extern uint midiInReset(IntPtr handle);
        [DllImport("winmm.dll")] private static extern uint midiInClose(IntPtr handle);
    }
}

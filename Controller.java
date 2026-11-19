package studio.temporal.loom;

import android.media.midi.*;
import android.app.AlertDialog;
import java.util.ArrayList;

final class Controller {
    final Loom host;
    MidiDevice device;
    MidiOutputPort port;
    int generation;
    Controller(Loom host){this.host=host;}
    void close(){
        generation++;
        try{if(port!=null)port.close();}catch(Exception ignored){}
        try{if(device!=null)device.close();}catch(Exception ignored){}
        port=null;device=null;
    }
    void choose(){
        MidiManager manager=(MidiManager)host.getSystemService("midi");
        ArrayList<MidiDeviceInfo> devices=new ArrayList<>();
        ArrayList<Integer> ports=new ArrayList<>();
        ArrayList<String> labels=new ArrayList<>();
        if(manager!=null)for(MidiDeviceInfo info:manager.getDevices()){
            for(MidiDeviceInfo.PortInfo p:info.getPorts())if(p.getType()==MidiDeviceInfo.PortInfo.TYPE_OUTPUT){
                devices.add(info);ports.add(p.getPortNumber());
                labels.add(info.getProperties().getString(MidiDeviceInfo.PROPERTY_NAME,"MIDI device")+" · port "+(p.getPortNumber()+1));
            }
        }
        if(labels.isEmpty()){host.notice("Connect a MIDI controller and try again");return;}
        new AlertDialog.Builder(host).setTitle("MIDI input").setItems(labels.toArray(new String[0]),(dialog,index)->{
            close();int request=generation;
            manager.openDevice(devices.get(index),opened->{
                if(opened==null){host.notice("Controller unavailable");return;}
                if(request!=generation){try{opened.close();}catch(Exception ignored){}return;}
                device=opened;port=device.openOutputPort(ports.get(index));
                if(port==null){close();host.notice("MIDI port unavailable");return;}
                port.connect(new MidiReceiver(){
                    int status,first=-1;
                    public void onSend(byte[] data,int offset,int count,long time){
                        for(int i=offset;i<offset+count;i++){
                            int value=data[i]&255;
                            if(value>=248)continue;
                            if(value>=128){status=value;first=-1;continue;}
                            int type=status&240;
                            if(type!=128 && type!=144 && type!=176)continue;
                            if(first<0){first=value;continue;}
                            String call="nativeNote("+status+","+first+","+value+")";
                            first=-1;host.runOnUiThread(()->{if(request==generation)host.web.evaluateJavascript(call,null);});
                        }
                    }
                });
                host.web.evaluateJavascript("nativeMidiReady()",null);
            },new android.os.Handler(host.getMainLooper()));
        }).show();
    }
}

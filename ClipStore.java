package studio.temporal.loom;

import android.content.Intent;
import android.net.Uri;
import android.util.Base64;
import java.io.*;
import java.text.SimpleDateFormat;
import java.util.*;

final class ClipStore {
    final Loom host;
    private File pending;
    private FileOutputStream output;
    private String format;
    private boolean ready,choosing,converting; private Uri lastSaved;
    ClipStore(Loom host){this.host=host;}
    synchronized boolean begin(String extension){
        if(pending!=null)return false;
        format="mp4".equals(extension)?"mp4":"webm";
        try{
            pending=File.createTempFile("loom-clip-","."+format,host.getCacheDir());
            output=new FileOutputStream(pending);return true;
        }catch(IOException e){discard();return false;}
    }
    synchronized boolean append(String chunk){
        if(output==null||chunk.length()>180000)return false;
        try{output.write(Base64.decode(chunk,Base64.DEFAULT));return true;}
        catch(Exception e){return false;}
    }
    synchronized void discard(){
        if(choosing || ready || converting)return;
        if(output!=null)try{output.close();}catch(IOException ignored){}
        output=null;if(pending!=null)pending.delete();pending=null;
    }
    synchronized void finish(){
        try{
            if(output==null)return;
            output.close();output=null;
            if(pending.length()==0)throw new IOException();
            converting=true;final File capture=pending;
            new Thread(()->{
                try{
                    File mp4=Mp4Export.convert(capture);
                    synchronized(ClipStore.this){pending=mp4;format="mp4";capture.delete();converting=false;ready=true;}
                    host.runOnUiThread(this::prompt);
                }catch(Exception e){
                    synchronized(ClipStore.this){converting=false;discard();}
                    host.runOnUiThread(()->status("MP4 export failed: "+e.getClass().getSimpleName()));
                }
            }).start();
        }catch(IOException e){discard();host.runOnUiThread(()->status("Empty clip. Try recording again."));}
    }
    synchronized void prompt(){
        if(!host.resumed||!ready||choosing)return;
        Intent intent=new Intent(Intent.ACTION_CREATE_DOCUMENT).addCategory(Intent.CATEGORY_OPENABLE);
        intent.setType("video/"+format);
        String date=new SimpleDateFormat("yyyyMMdd-HHmmss",Locale.US).format(new Date());
        intent.putExtra(Intent.EXTRA_TITLE,"Temporal-Loom-"+date+"."+format);
        try{choosing=true;host.startActivityForResult(intent,5);}
        catch(Exception e){choosing=false;ready=false;discard();status("Could not open the save dialog.");}
    }
    void share(){
        if(lastSaved==null)return;
        Intent send=new Intent(Intent.ACTION_SEND).setType("video/mp4").putExtra(Intent.EXTRA_STREAM,lastSaved);
        send.setClipData(android.content.ClipData.newRawUri("Temporal Loom clip",lastSaved));
        send.addFlags(Intent.FLAG_GRANT_READ_URI_PERMISSION);
        try{host.startActivity(Intent.createChooser(send,"Share clip"));}catch(Exception e){status("No sharing app available.");}
    }
    void status(String message){host.web.evaluateJavascript("clipStatus("+org.json.JSONObject.quote(message)+")",null);}
    synchronized void save(Uri uri){
        if(!choosing)return;
        final File file=pending;
        if(uri==null){choosing=false;ready=false;discard();status("Clip save cancelled.");return;}
        new Thread(()->{
            String message="Clip saved.";
            try(InputStream in=new FileInputStream(file);OutputStream out=host.getContentResolver().openOutputStream(uri,"w")){
                if(out==null)throw new IOException();
                byte[] data=new byte[65536];int count;while((count=in.read(data))!=-1)out.write(data,0,count);
            }catch(Exception e){message="Could not save the clip.";}
            final String result=message;
            host.runOnUiThread(()->{synchronized(ClipStore.this){choosing=false;ready=false;discard();}if(result.equals("Clip saved.")){lastSaved=uri;host.web.evaluateJavascript("document.getElementById('shareClip').hidden=false",null);}status(result);});
        }).start();
    }
}

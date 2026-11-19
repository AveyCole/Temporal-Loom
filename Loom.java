package studio.temporal.loom;
import android.app.Activity;
import android.os.Bundle;
import android.webkit.*;
import android.media.*;
import android.content.pm.PackageManager;
import android.Manifest;
public class Loom extends Activity {
    ClipStore clips=new ClipStore(this); ImageSources sources=new ImageSources(this); GoogleImages google; WebView web; Controller controller=new Controller(this);
    volatile double level;
    volatile Thread reader;
    boolean resumed, pending, startAfterResume;
    ValueCallback<android.net.Uri[]> selection;
    byte[] exportData;
    protected void onActivityResult(int code,int result,android.content.Intent data){
        super.onActivityResult(code,result,data);
        if(code==5)clips.save(result==RESULT_OK&&data!=null?data.getData():null);
        if(code==4)sources.folderResult(result==RESULT_OK && data!=null?data.getData():null);
        if(code==2 && selection!=null){
            android.net.Uri[] uris=WebChromeClient.FileChooserParams.parseResult(result,data);
            if(result==RESULT_OK && data!=null && data.getClipData()!=null){
                android.content.ClipData clip=data.getClipData();
                uris=new android.net.Uri[clip.getItemCount()];
                for(int i=0;i<uris.length;i++)uris[i]=clip.getItemAt(i).getUri();
            }
            selection.onReceiveValue(uris);selection=null;
        }
        if(code==3 && exportData!=null){
            try{if(result==RESULT_OK && data!=null){try(java.io.OutputStream out=getContentResolver().openOutputStream(data.getData())){out.write(exportData);}notice("Saved");}}
            catch(Exception e){notice("Could not save file");}finally{exportData=null;}
        }
    }
    void notice(String message){android.widget.Toast.makeText(this,message,0).show();}
    public void onCreate(Bundle state){
        super.onCreate(state);
        web=new WebView(this);
        web.getSettings().setJavaScriptEnabled(true);
        web.getSettings().setDomStorageEnabled(true);
        web.getSettings().setMediaPlaybackRequiresUserGesture(false);
        web.getSettings().setAllowFileAccess(false);
        web.setWebViewClient(new ArchiveClient(this));
        web.setWebChromeClient(new WebChromeClient(){
            public boolean onShowFileChooser(WebView v,ValueCallback<android.net.Uri[]> cb,FileChooserParams params){
                if(selection!=null)selection.onReceiveValue(null);
                selection=cb;
                android.content.Intent intent=params.createIntent();
                java.util.List<String> accepted=new java.util.ArrayList<>();
                for(String entry:params.getAcceptTypes()){
                    if(entry==null)continue;
                    for(String mime:entry.split(",")){
                        if(!mime.trim().isEmpty())accepted.add(mime.trim());
                    }
                }
                if(accepted.size()>1){
                    intent.setType("*/*");
                    intent.putExtra(android.content.Intent.EXTRA_MIME_TYPES,accepted.toArray(new String[0]));
                }
                intent.putExtra(android.content.Intent.EXTRA_ALLOW_MULTIPLE,params.getMode()==FileChooserParams.MODE_OPEN_MULTIPLE);
                try{startActivityForResult(intent,2);}catch(Exception e){selection.onReceiveValue(null);selection=null;}
                return true;
            }
        });
        web.addJavascriptInterface(new Input(),"Mic");
        android.widget.FrameLayout shell=new android.widget.FrameLayout(this);shell.addView(web);setContentView(shell);google=new GoogleImages(this,shell);
        web.loadUrl("https://loom.invalid/");
    }
    boolean immersive;
    void fullscreen(boolean enable){
        immersive=enable;
        if(android.os.Build.VERSION.SDK_INT>=30){
            android.view.WindowInsetsController controller=getWindow().getInsetsController();
            if(controller!=null){
                controller.setSystemBarsBehavior(android.view.WindowInsetsController.BEHAVIOR_SHOW_TRANSIENT_BARS_BY_SWIPE);
                if(enable)controller.hide(android.view.WindowInsets.Type.systemBars());
                else controller.show(android.view.WindowInsets.Type.systemBars());
                return;
            }
        }
        getWindow().getDecorView().setSystemUiVisibility(enable?
            android.view.View.SYSTEM_UI_FLAG_FULLSCREEN|android.view.View.SYSTEM_UI_FLAG_HIDE_NAVIGATION|
            android.view.View.SYSTEM_UI_FLAG_IMMERSIVE_STICKY:0);
    }
    @Override public void onWindowFocusChanged(boolean hasFocus){
        super.onWindowFocusChanged(hasFocus);
        if(hasFocus&&immersive)fullscreen(true);
    }
    @Override public void onBackPressed(){
        if(immersive){fullscreen(false);web.evaluateJavascript("setStageFull(false)",null);}
        else super.onBackPressed();
    }
    public class Input {
        @JavascriptInterface public void googleSearch(int id,String query,int offset){runOnUiThread(()->google.search(id,query,offset));}
        @JavascriptInterface public void browseGoogle(String terms){runOnUiThread(()->google.show(terms));}
        @JavascriptInterface public void full(boolean value){runOnUiThread(()->fullscreen(value));}
        @JavascriptInterface public void save(String name,String base64){runOnUiThread(()->{
            if(exportData!=null||base64.length()>32000000)return;
            try{exportData=android.util.Base64.decode(base64,android.util.Base64.DEFAULT);
            android.content.Intent intent=new android.content.Intent(android.content.Intent.ACTION_CREATE_DOCUMENT);
            intent.addCategory(android.content.Intent.CATEGORY_OPENABLE);
            intent.setType(name.endsWith(".png")?"image/png":"application/json");
            intent.putExtra(android.content.Intent.EXTRA_TITLE,name);startActivityForResult(intent,3);
            }catch(Exception e){exportData=null;notice("Could not open save dialog");}
        });}
        @JavascriptInterface public boolean beginClip(String format){return clips.begin(format);}
        @JavascriptInterface public boolean writeClip(String data){return clips.append(data);}
        @JavascriptInterface public void shareClip(){runOnUiThread(()->clips.share());}
        @JavascriptInterface public void finishClip(){clips.finish();}
        @JavascriptInterface public void discardClip(){clips.discard();}
        @JavascriptInterface public void folder(String media){runOnUiThread(()->sources.chooseFolder(media));}
        @JavascriptInterface public void releaseLocal(String path){
            sources.files.remove(path);
            sources.fileTypes.remove(path);
        }
        @JavascriptInterface public void midi(){runOnUiThread(()->controller.choose());}
        @JavascriptInterface public double amplitude(){return level;}
        @JavascriptInterface public void toggle(){runOnUiThread(()->{
            if(reader!=null){stopMic();return;}
            if(!resumed || pending)return;
            if(checkSelfPermission(Manifest.permission.RECORD_AUDIO)==PackageManager.PERMISSION_GRANTED)startMic();
            else {pending=true;requestPermissions(new String[]{Manifest.permission.RECORD_AUDIO},1);}
        });}
    }
    void status(String label){web.evaluateJavascript("micState('"+label+"')",null);}
    void startMic(){
        if(reader!=null)return;
        reader=new Thread(()->{
            AudioRecord rec=null;
            Thread self=Thread.currentThread();
            try{
                int size=AudioRecord.getMinBufferSize(16000,16,2);
                rec=new AudioRecord(MediaRecorder.AudioSource.MIC,16000,16,2,Math.max(4096,size));
                rec.startRecording();
                runOnUiThread(()->{if(reader==self)status("Mic on");});
                short[] samples=new short[512];
                while(reader==self){
                    int n=rec.read(samples,0,samples.length);
                    if(n<=0)throw new IllegalStateException();
                    double sum=0;
                    for(int i=0;i<n;i++)sum+=(double)samples[i]*samples[i];
                    if(reader==self)level=Math.min(1,Math.sqrt(sum/n)/3500);
                }
            }catch(RuntimeException e){runOnUiThread(()->{if(reader==self){reader=null;level=0;status("Mic unavailable");}});}
            finally{if(rec!=null)rec.release();}
        });
        reader.start();
    }
    void stopMic(){reader=null;level=0;status("Mic off");}
    public void onRequestPermissionsResult(int r,String[] p,int[] g){
        super.onRequestPermissionsResult(r,p,g);
        if(r==1){pending=false;if(g.length>0 && g[0]==0){if(resumed)startMic();else startAfterResume=true;}else {status("Mic off");notice("Microphone permission is required for live input");}}
    }
    protected void onDestroy(){controller.close();google.close();super.onDestroy();}
    protected void onResume(){super.onResume();resumed=true;web.onResume();web.evaluateJavascript("if(typeof setVideoBackgrounded==='function')setVideoBackgrounded(false)",null);clips.prompt();if(startAfterResume){startAfterResume=false;startMic();}}
    protected void onPause(){resumed=false;web.evaluateJavascript("if(typeof setVideoBackgrounded==='function')setVideoBackgrounded(true);if(typeof stopClip==='function'){if(clipArmed)disarmClip();stopClip();}",null);stopMic();web.onPause();super.onPause();}
}



package studio.temporal.loom;
import android.app.Activity;
import android.os.Bundle;
import android.webkit.*;
import android.media.*;
import android.content.pm.PackageManager;
import android.Manifest;
public class Loom extends Activity {
    private static final int CAMERA_PERMISSION=6, MICROPHONE_PERMISSION=1;
    ClipStore clips=new ClipStore(this); ImageSources sources=new ImageSources(this); GoogleImages google; WebView web; Controller controller=new Controller(this);
    boolean resumed;
    volatile Thread nativeMic;
    volatile double nativeLevel;
    volatile int nativeClipToken;
    final java.util.concurrent.atomic.AtomicBoolean nativeDispatch=new java.util.concurrent.atomic.AtomicBoolean();
    ValueCallback<android.net.Uri[]> selection;
    PermissionRequest pendingCapture;
    int pendingCaptureCode;
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
            @Override public void onPermissionRequest(PermissionRequest request){
                android.net.Uri origin=request.getOrigin();
                String[] resources=request.getResources();
                boolean video=resources.length==1&&PermissionRequest.RESOURCE_VIDEO_CAPTURE.equals(resources[0]);
                boolean audio=resources.length==1&&PermissionRequest.RESOURCE_AUDIO_CAPTURE.equals(resources[0]);
                if(!"https".equals(origin.getScheme())||!"loom.invalid".equals(origin.getHost())||
                   (origin.getPort()!=-1&&origin.getPort()!=443)||origin.getUserInfo()!=null||
                   (!video&&!audio)){
                    request.deny();return;
                }
                String permission=video?Manifest.permission.CAMERA:Manifest.permission.RECORD_AUDIO;
                if(checkSelfPermission(permission)==PackageManager.PERMISSION_GRANTED){
                    request.grant(resources);
                }else if(pendingCapture==null){
                    pendingCapture=request;pendingCaptureCode=video?CAMERA_PERMISSION:MICROPHONE_PERMISSION;
                    requestPermissions(new String[]{permission},pendingCaptureCode);
                }else request.deny();
            }
            @Override public void onPermissionRequestCanceled(PermissionRequest request){
                if(pendingCapture==request)pendingCapture=null;
            }
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
        @JavascriptInterface public void startNativeMic(){runOnUiThread(Loom.this::startNativeMic);}
        @JavascriptInterface public void stopNativeMic(){Loom.this.stopNativeMic();}
        @JavascriptInterface public double nativeAmplitude(){return nativeLevel;}
        @JavascriptInterface public void captureClipMic(int token){nativeClipToken=token;}
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
    }
    void stopNativeMic(){nativeMic=null;nativeLevel=0;nativeClipToken=0;}
    void nativeMicState(boolean active){web.evaluateJavascript("micInput.nativeState("+active+")",null);}
    void startNativeMic(){
        if(nativeMic!=null)return;
        if(!resumed||checkSelfPermission(Manifest.permission.RECORD_AUDIO)!=PackageManager.PERMISSION_GRANTED){nativeMicState(false);return;}
        nativeMic=new Thread(()->{
            AudioRecord input=null;Thread self=Thread.currentThread();
            try{
                int size=AudioRecord.getMinBufferSize(16000,AudioFormat.CHANNEL_IN_MONO,AudioFormat.ENCODING_PCM_16BIT);
                input=new AudioRecord(MediaRecorder.AudioSource.MIC,16000,AudioFormat.CHANNEL_IN_MONO,AudioFormat.ENCODING_PCM_16BIT,Math.max(4096,size));
                input.startRecording();runOnUiThread(()->{if(nativeMic==self)nativeMicState(true);});
                short[] samples=new short[512];byte[] packet=new byte[8192];int used=0,previous=0;
                while(nativeMic==self){
                    int count=input.read(samples,0,samples.length);if(count<=0)throw new IllegalStateException();
                    double sum=0;for(int i=0;i<count;i++)sum+=(double)samples[i]*samples[i];
                    if(nativeMic!=self)break;
                    nativeLevel=Math.min(1,Math.sqrt(sum/count)/3500);
                    int token=nativeClipToken;if(token!=previous){used=0;previous=token;}
                    if(token==0)continue;
                    if(used+count*2>packet.length)used=0;
                    for(int i=0;i<count;i++){packet[used++]=(byte)samples[i];packet[used++]=(byte)(samples[i]>>8);}
                    if(used>=2048&&nativeDispatch.compareAndSet(false,true)){
                        String data=android.util.Base64.encodeToString(packet,0,used,android.util.Base64.NO_WRAP);used=0;
                        runOnUiThread(()->{
                            if(nativeMic==self&&nativeClipToken==token)web.evaluateJavascript("clipMicPcm("+token+",'"+data+"',16000,1)",v->nativeDispatch.set(false));
                            else nativeDispatch.set(false);
                        });
                    }
                }
            }catch(RuntimeException e){runOnUiThread(()->{if(nativeMic==self){stopNativeMic();nativeMicState(false);}});}
            finally{if(input!=null)input.release();}
        },"Loom microphone");
        nativeMic.start();
    }
    public void onRequestPermissionsResult(int r,String[] p,int[] g){
        super.onRequestPermissionsResult(r,p,g);
        if(r==pendingCaptureCode&&pendingCapture!=null){
            PermissionRequest request=pendingCapture;pendingCapture=null;
            if(g.length>0&&g[0]==PackageManager.PERMISSION_GRANTED)
                request.grant(request.getResources());
            else request.deny();
        }
    }
    protected void onDestroy(){stopNativeMic();if(pendingCapture!=null){pendingCapture.deny();pendingCapture=null;}controller.close();google.close();super.onDestroy();}
    protected void onResume(){super.onResume();resumed=true;web.onResume();web.evaluateJavascript("if(typeof setVideoBackgrounded==='function')setVideoBackgrounded(false)",null);clips.prompt();}
    protected void onPause(){resumed=false;web.evaluateJavascript("if(typeof cameraStream!=='undefined'&&cameraStream)stopCameraCapture();if(typeof setVideoBackgrounded==='function')setVideoBackgrounded(true);if(typeof stopClip==='function'){if(clipArmed)disarmClip();stopClip();}if(typeof micInput!=='undefined'&&micInput.active())micInput.stop();",null);web.onPause();super.onPause();}
}



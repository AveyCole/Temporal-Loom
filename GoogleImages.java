package studio.temporal.loom;

import android.app.AlertDialog;
import android.graphics.Color;
import android.net.Uri;
import android.os.Handler;
import android.webkit.*;
import android.widget.*;
import android.view.ViewGroup;
import org.json.*;
import java.io.*;
import java.security.MessageDigest;

/** Isolated browser for public Google Images results. No app bridge is attached. */
final class GoogleImages {
    final Loom host;
    final WebView browser;
    final FrameLayout root;
    final Handler handler=new Handler();
    int active;
    AlertDialog dialog;
    GoogleImages(Loom host,FrameLayout root){
        this.host=host;this.root=root;browser=new WebView(host);
        browser.getSettings().setJavaScriptEnabled(true);browser.getSettings().setDomStorageEnabled(true);
        browser.getSettings().setAllowFileAccess(false);browser.getSettings().setAllowContentAccess(false);
        browser.setWebViewClient(new WebViewClient(){
            public boolean shouldOverrideUrlLoading(WebView v,WebResourceRequest r){return !"https".equals(r.getUrl().getScheme());}
        });
        root.addView(browser,0,new FrameLayout.LayoutParams(-1,-1));
    }
    void search(int id,String query,int offset){
        active=id;handler.removeCallbacksAndMessages(null);
        String url=new Uri.Builder().scheme("https").authority("www.google.com").path("/search")
            .appendQueryParameter("udm","2").appendQueryParameter("q",query).appendQueryParameter("start",String.valueOf(offset)).build().toString();
        browser.loadUrl(url);handler.postDelayed(()->read(id,0),1800);
    }
    private void read(int id,int attempt){
        if(id!=active)return;
        String script="(()=>{const out=[],seen=new Set();"
            +"if(!location.pathname.startsWith('/search'))return out;"
            +"for(const img of document.images){const src=img.currentSrc||img.src;"
            +"if(!src||seen.has(src)||img.naturalWidth<65||img.naturalHeight<45||/googlelogo|branding|favicon/i.test(src))continue;"
            +"const anchor=img.closest('a');let link='',orig='';if(anchor){const u=new URL(anchor.href,location.href);link=u.searchParams.get('imgrefurl')||'';orig=u.searchParams.get('imgurl')||'';}"
            +"if(!src.startsWith('https://')&&!/^data:image\\/(jpeg|png|webp);base64,/i.test(src))continue;"
            +"if(src.length>220000)continue;seen.add(src);out.push({src:orig.startsWith('https://')?orig:src,link,title:(img.alt||img.title||'Google Images result').slice(0,250)});if(out.length>=24)break;}return out;})()";
        browser.evaluateJavascript(script,raw->{
            if(id!=active)return;
            try{
                JSONArray rows=new JSONArray(raw),items=new JSONArray();
                for(int i=0;i<rows.length();i++){
                    JSONObject row=rows.getJSONObject(i);String src=row.optString("src"),link=row.optString("link"),image;
                    if(src.startsWith("data:image/")){
                        byte[] bytes=android.util.Base64.decode(src.substring(src.indexOf(',')+1),android.util.Base64.DEFAULT);
                        if(bytes.length<60||bytes.length>180000)continue;
                        StringBuilder name=new StringBuilder();
                        for(byte b:MessageDigest.getInstance("SHA-256").digest(bytes))name.append(String.format(java.util.Locale.ROOT,"%02x",b));
                        File dir=new File(host.getCacheDir(),"google-thumbs");dir.mkdirs();File target=new File(dir,name.toString());
                        if(!target.exists())try(FileOutputStream output=new FileOutputStream(target)){output.write(bytes);}
                        image="/google-thumb/"+name;
                    }else if(src.startsWith("https://"))image="/web-image?url="+Uri.encode(src);else continue;
                    if(!link.startsWith("https://"))link=src.startsWith("https://")?src:browser.getUrl();
                    items.put(new JSONObject().put("image",image).put("link",link).put("source","Google Images").put("date","Web search").put("title",row.optString("title")));
                }
                if(items.length()==0&&attempt<8){handler.postDelayed(()->read(id,attempt+1),900);return;}
                String note=items.length()==0?"Google returned no readable images. Open Google Images to check the results.":"";
                host.web.evaluateJavascript("googleResult("+id+","+items+","+JSONObject.quote(note)+")",null);
            }catch(Exception e){host.web.evaluateJavascript("googleResult("+id+",[],'Google Images unavailable.')",null);}
        });
    }
    void show(String query){
        if(dialog!=null)return;
        if(browser.getUrl()==null)browser.loadUrl("https://www.google.com/search?udm=2&q="+Uri.encode(query));
        root.removeView(browser);
        dialog=new AlertDialog.Builder(host).setTitle("Google Images").setView(browser).setPositiveButton("Done",null).create();
        dialog.setOnDismissListener(d->{ViewGroup parent=(ViewGroup)browser.getParent();if(parent!=null)parent.removeView(browser);root.addView(browser,0,new FrameLayout.LayoutParams(-1,-1));dialog=null;});
        dialog.show();
    }
    WebResourceResponse thumbnail(String hash)throws IOException{
        if(!hash.matches("[0-9a-f]{64}"))throw new FileNotFoundException();
        BufferedInputStream input=new BufferedInputStream(new FileInputStream(new File(new File(host.getCacheDir(),"google-thumbs"),hash)));
        String mime=java.net.URLConnection.guessContentTypeFromStream(input);
        return new WebResourceResponse(mime==null?"image/webp":mime,null,input);
    }
    void close(){active=-1;handler.removeCallbacksAndMessages(null);if(dialog!=null)dialog.dismiss();root.removeView(browser);browser.destroy();}
}

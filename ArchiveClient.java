package studio.temporal.loom;

import android.net.Uri;
import android.webkit.*;
import java.io.*;
import java.net.*;
import java.util.*;

class ArchiveClient extends WebViewClient {
    final Loom activity;
    ArchiveClient(Loom activity){this.activity=activity;}
    public boolean shouldOverrideUrlLoading(WebView v,WebResourceRequest req){
        Uri uri=req.getUrl();
        if(req.hasGesture() && "https".equals(uri.getScheme())){
            try{activity.startActivity(new android.content.Intent(android.content.Intent.ACTION_VIEW,uri));}catch(Exception ignored){}
        }
        return true;
    }
    WebResourceResponse error(){return new WebResourceResponse("text/plain","UTF-8",502,"Unavailable",Collections.emptyMap(),new ByteArrayInputStream(new byte[0]));}
    public WebResourceResponse shouldInterceptRequest(WebView view,WebResourceRequest req){
        Uri u=req.getUrl();
        try{
            if(!"loom.invalid".equals(u.getHost()))return error();
            String path=u.getPath();
            if("/".equals(path)||"/archive.js".equals(path)){
                boolean html="/".equals(path);
                return new WebResourceResponse(html?"text/html":"application/javascript","UTF-8",activity.getAssets().open(html?"index.html":"archive.js"));
            }
            if("/thesaurus.json".equals(path))return new WebResourceResponse("application/json","UTF-8",activity.getAssets().open("thesaurus.json"));
            if(path.matches("/type-fonts/(catalog\\.css|[0-9a-f]{20}\\.woff2)")){
                boolean css=path.endsWith(".css");
                return new WebResourceResponse(css?"text/css":"font/woff2",css?"UTF-8":null,activity.getAssets().open(path.substring(1)));
            }
            if(path.startsWith("/google-thumb/"))return activity.google.thumbnail(path.substring("/google-thumb/".length()));
            if(path.startsWith("/folder/"))return FolderMedia.open(activity.getContentResolver(),activity.sources.files.get(path),activity.sources.fileTypes.get(path),req.getRequestHeaders().get("Range"));
            if(path.equals("/web-video")||path.equals("/web-audio")){
                String range=null;
                for(Map.Entry<String,String> header:req.getRequestHeaders().entrySet())if(header.getKey().equalsIgnoreCase("Range"))range=header.getValue();
                return RemoteVideo.open(u.getQueryParameter("url"),range,path.equals("/web-audio"));
            }
            if(path.equals("/website")||path.equals("/web-image")){
                String media=u.getQueryParameter("media");
                if(media==null)media="1".equals(u.getQueryParameter("video"))?"both":"photos";
                return ImageSources.website(u.getQueryParameter("url"),path.equals("/website"),media);
            }
            String url;
            boolean json="/relay".equals(path);
            boolean sound="/field-audio".equals(path);
            if(sound){
                url=u.getQueryParameter("url");
                if(url==null||!url.matches("https://archive\\.org/download/aporee_[0-9]+_[0-9]+/[^/]+"))return error();
            }else if(json)url=u.getQueryParameter("url");
            else if("/api/image".equals(path)){
                if("ia".equals(u.getQueryParameter("kind"))){
                    String id=u.getQueryParameter("id");
                    if(id==null||!id.matches("[\\w.-]{1,200}"))return error();
                    url="https://archive.org/services/img/"+id;
                }else{
                    String ts=u.getQueryParameter("timestamp");
                    String original=u.getQueryParameter("url");
                    if(ts==null||!ts.matches("[0-9]{14}")||original==null||!original.matches("https?://.+"))return error();
                    url="https://web.archive.org/web/"+ts+"im_/"+original;
                }
            }else return error();
            for(int i=0;i<5;i++){
                URL endpoint=new URL(url);
                String host=endpoint.getHost();
                boolean commons=json && (host.equals("commons.wikimedia.org")||host.equals("en.wikipedia.org")) && endpoint.getPath().equals("/w/api.php");
                boolean catalog=json && (host.equals("images-api.nasa.gov") && (endpoint.getPath().equals("/search")||endpoint.getPath().startsWith("/asset/"))
                    || (host.equals("video.blender.org")||host.equals("peertube.tv")||host.equals("tilvids.com")||host.equals("fedi.video")
                        ||host.equals("diode.zone")||host.equals("makertube.net")||host.equals("video.hardlimit.com"))
                        && (endpoint.getPath().equals("/api/v1/search/videos")||endpoint.getPath().startsWith("/api/v1/videos/")));
                if(!endpoint.getProtocol().equals("https")||!(commons||catalog||host.equals("archive.org")||host.endsWith(".archive.org"))||endpoint.getUserInfo()!=null)return error();
                if(!json && (endpoint.getPath().equals("/images/notfound.png") ||
                        endpoint.getPath().matches("/images/glogo\\.(jpg|png)") ||
                        endpoint.getPath().equals("/favicon.ico")))return error();
                HttpURLConnection conn=(HttpURLConnection)endpoint.openConnection();
                boolean streamed=false;
                try{
                    conn.setInstanceFollowRedirects(false);conn.setConnectTimeout(8000);conn.setReadTimeout(12000);
                    conn.setRequestProperty("User-Agent","TemporalLoom/1.6 (Android visual instrument; https://temporal-loom-av.c4r3ful-cr34tur3.chatgpt.site/)");
                    int code=conn.getResponseCode();
                    if(code>=300 && code<400){url=new URL(endpoint,conn.getHeaderField("Location")).toString().replaceFirst("^http:","https:");continue;}
                    if(code!=200)return error();
                    String mime=conn.getContentType().split(";")[0];
                    if(sound){
                        final int limit=48*1024*1024;
                        if(conn.getContentLengthLong()>limit || !(mime.startsWith("audio/")||mime.equals("application/octet-stream")))return error();
                        InputStream stream=new FilterInputStream(conn.getInputStream()){
                            int total;
                            public int read(byte[] data,int off,int len)throws IOException{
                                int n=super.read(data,off,len);if(n>0 && (total+=n)>limit){close();throw new IOException("Recording too large");}return n;
                            }
                            public void close()throws IOException{try{super.close();}finally{conn.disconnect();}}
                        };
                        streamed=true;
                        return new WebResourceResponse("audio/mpeg",null,stream);
                    }
                    if(!json&&!mime.matches("image/(png|jpeg|gif|webp)"))return error();
                    ByteArrayOutputStream out=new ByteArrayOutputStream();
                    try(InputStream in=conn.getInputStream()){
                        byte[] buffer=new byte[8192];int n;
                        while((n=in.read(buffer))>=0){if(out.size()+n>8*1024*1024)return error();out.write(buffer,0,n);}
                    }
                    return new WebResourceResponse(json?"application/json":mime,json?"UTF-8":null,new ByteArrayInputStream(out.toByteArray()));
                }finally{if(!streamed)conn.disconnect();}
            }
        }catch(Exception ignored){}
        return error();
    }
}

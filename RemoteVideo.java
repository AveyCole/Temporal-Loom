package studio.temporal.loom;

import android.webkit.WebResourceResponse;
import java.io.*;
import java.net.*;
import java.util.*;

final class RemoteVideo {
    static WebResourceResponse open(String target, String range)throws Exception{
        URL url=ImageSources.https(target);
        for(int hop=0;hop<6;hop++){
            HttpURLConnection request=(HttpURLConnection)url.openConnection();
            boolean handedOff=false;
            try{
                request.setConnectTimeout(8000);
                request.setReadTimeout(15000);
                request.setInstanceFollowRedirects(false);
                request.setRequestProperty("Accept-Encoding","identity");
                request.setRequestProperty("User-Agent","TemporalLoom/1.11 (Android visual instrument; https://temporal-loom-av.c4r3ful-cr34tur3.chatgpt.site/)");
                if(range!=null && range.matches("bytes=(\\d+-\\d*|-\\d+)"))request.setRequestProperty("Range",range);
                int status=request.getResponseCode();
                if(status>=300&&status<400 && request.getHeaderField("Location")!=null){
                    url=ImageSources.https(new URL(url,request.getHeaderField("Location")).toString());
                    continue;
                }
                if(status!=200&&status!=206)throw new IOException("Video server returned "+status);
                String mime=ImageSources.videoMime(request.getContentType(),url.getPath());
                if(mime==null)throw new IOException("Unsupported video format");
                Map<String,String> headers=new HashMap<>();
                headers.put("X-Content-Type-Options","nosniff");
                for(String key:new String[]{"Content-Range","Content-Length","Accept-Ranges"}){
                    String value=request.getHeaderField(key);
                    if(value!=null)headers.put(key,value);
                }
                InputStream body=new FilterInputStream(request.getInputStream()){
                    @Override public void close()throws IOException{try{super.close();}finally{request.disconnect();}}
                };
                WebResourceResponse response=new WebResourceResponse(mime,null,status,status==206?"Partial Content":"OK",headers,body);
                handedOff=true;
                return response;
            }finally{if(!handedOff)request.disconnect();}
        }
        throw new IOException("Too many redirects");
    }
}

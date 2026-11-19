package studio.temporal.loom;

import android.content.*;
import android.database.Cursor;
import android.net.Uri;
import android.provider.DocumentsContract;
import android.provider.DocumentsContract.Document;
import android.webkit.MimeTypeMap;
import android.webkit.WebResourceResponse;
import java.io.*;
import java.net.*;
import java.util.*;
import org.json.*;
import org.jsoup.Jsoup;
import org.jsoup.nodes.Element;

final class ImageSources {
    final Loom host;
    final Map<String,Uri> files=new java.util.concurrent.ConcurrentHashMap<>();
    final Map<String,String> fileTypes=new java.util.concurrent.ConcurrentHashMap<>();
    private static final int FOLDER_CANDIDATES=2048;
    private String folderMedia="both";
    ImageSources(Loom host){this.host=host;}

    private String mediaType(String reported,String name){
        String type=reported==null?"":reported.toLowerCase(Locale.ROOT);
        if(type.isEmpty()||type.equals("application/octet-stream")){
            if(name==null)return null;
            int dot=name.lastIndexOf('.');
            if(dot<0)return null;
            type=MimeTypeMap.getSingleton().getMimeTypeFromExtension(name.substring(dot+1).toLowerCase(Locale.ROOT));
        }
        if(type==null)return null;
        return type.startsWith("video/")||type.matches("image/(jpeg|png|gif|webp|bmp|avif|heic|heif)")?type:null;
    }

    void chooseFolder(String media){
        folderMedia=media;
        Intent open=new Intent(Intent.ACTION_OPEN_DOCUMENT_TREE);
        open.addFlags(Intent.FLAG_GRANT_READ_URI_PERMISSION);
        try{host.startActivityForResult(open,4);}catch(Exception e){folderResult(null);}
    }
    void folderResult(Uri tree){
        final String media=folderMedia;
        new Thread(()->{
            JSONArray items=new JSONArray();
            String message="Folder selection cancelled.";
            if(tree!=null)try{
                ContentResolver resolver=host.getContentResolver();
                ArrayDeque<String> todo=new ArrayDeque<>();
                todo.add(DocumentsContract.getTreeDocumentId(tree));
                ArrayList<JSONObject> sampled=new ArrayList<>();
                Map<String,Uri> candidates=new HashMap<>();
                Set<String> visited=new HashSet<>();
                Random random=new Random();
                int seen=0;
                String[] cols={Document.COLUMN_DOCUMENT_ID,Document.COLUMN_DISPLAY_NAME,Document.COLUMN_MIME_TYPE};
                while(!todo.isEmpty() && visited.size()<500){
                    String parent=todo.remove();
                    if(!visited.add(parent))continue;
                    Uri children=DocumentsContract.buildChildDocumentsUriUsingTree(tree,parent);
                    try(Cursor rows=resolver.query(children,cols,null,null,null)){
                        while(rows!=null && rows.moveToNext()){
                            String id=rows.getString(0),name=rows.getString(1),mime=rows.getString(2);
                            if(Document.MIME_TYPE_DIR.equals(mime)){todo.add(id);continue;}
                            mime=mediaType(mime,name);
                            if(mime==null)continue;
                            boolean video=mime.startsWith("video/");
                            if("photos".equals(media)&&video||"videos".equals(media)&&!video)continue;
                            int slot=seen<FOLDER_CANDIDATES?seen:random.nextInt(seen+1);seen++;
                            if(slot>=FOLDER_CANDIDATES)continue;
                            String key=UUID.randomUUID().toString();
                            JSONObject item=new JSONObject().put("title",name==null?"Local fragment":name)
                                    .put("date","Local file").put("source","Local file").put("image","/folder/"+key)
                                    .put("mime",mime).put("kind",video?"video":"image");
                            if(slot<sampled.size()){String old=sampled.set(slot,item).getString("image");candidates.remove(old);}else sampled.add(item);
                            candidates.put("/folder/"+key,DocumentsContract.buildDocumentUriUsingTree(tree,id));
                        }
                    }
                }
                files.putAll(candidates);
                for(JSONObject item:sampled)fileTypes.put(item.getString("image"),item.getString("mime"));
                Collections.shuffle(sampled,random);
                items=new JSONArray(sampled);message="No supported files of the selected type in this folder.";
            }catch(Exception e){message="Could not read this folder.";}
            String js="folderPicked("+items+","+JSONObject.quote(message)+")";
            host.runOnUiThread(()->host.web.evaluateJavascript(js,null));
        }).start();
    }
    WebResourceResponse local(String path)throws Exception{
        Uri uri=files.get(path);
        if(uri==null)throw new IOException();
        ContentResolver resolver=host.getContentResolver();
        return new WebResourceResponse(resolver.getType(uri),null,resolver.openInputStream(uri));
    }
    static URL https(String text)throws Exception{
        URL u=new URL(text);
        if(!u.getProtocol().equals("https")||u.getUserInfo()!=null||u.getHost().isEmpty())throw new IOException();
        return u;
    }
    static String videoMime(String type,String path){
        String mime=String.valueOf(type).toLowerCase(Locale.ROOT).split(";")[0].trim();
        if(mime.matches("video/(mp4|webm)"))return mime;
        if(mime.equals("application/octet-stream")||mime.equals("null")){
            if(path.toLowerCase(Locale.ROOT).endsWith(".mp4"))return "video/mp4";
            if(path.toLowerCase(Locale.ROOT).endsWith(".webm"))return "video/webm";
        }
        return null;
    }
    static boolean clipLink(String url){return url.matches("(?i).+\\.(mp4|webm)([?#].*)?");}
    static JSONObject websiteItem(String link,String title,boolean clip)throws JSONException{
        return new JSONObject().put("source","Website").put("date","Live website").put("title",title).put("link",link)
            .put("kind",clip?"video":"image").put("image",(clip?"/web-video?url=":"/web-image?url=")+Uri.encode(link));
    }
    static WebResourceResponse websiteResults(JSONArray list){
        return new WebResourceResponse("application/json","UTF-8",new ByteArrayInputStream(list.toString().getBytes(java.nio.charset.StandardCharsets.UTF_8)));
    }
    static WebResourceResponse website(String target,boolean page,String media)throws Exception{
        boolean video="videos".equals(media)||"both".equals(media),photo=!"videos".equals(media);
        URL u=https(target);
        for(int hop=0;hop<6;hop++){
            HttpURLConnection c=(HttpURLConnection)u.openConnection();
            try{
                c.setConnectTimeout(8000);c.setReadTimeout(12000);c.setInstanceFollowRedirects(false);
                c.setRequestProperty("User-Agent","TemporalLoom/1.6 (Android visual instrument; https://temporal-loom-av.c4r3ful-cr34tur3.chatgpt.site/)");
                int status=c.getResponseCode();
                if(status>=300&&status<400){u=https(new URL(u,c.getHeaderField("Location")).toString());continue;}
                if(status!=200)throw new IOException();
                String mime=String.valueOf(c.getContentType()).toLowerCase(Locale.ROOT).split(";")[0].trim();
                if(page&&video&&videoMime(mime,u.getPath())!=null)
                    return websiteResults(new JSONArray().put(websiteItem(u.toString(),u.getPath(),true)));
                boolean image=mime.matches("image/(jpeg|png|webp|gif|avif|bmp)");
                if(page&&image&&!photo)return websiteResults(new JSONArray());
                if(!image && (!page||!(mime.equals("text/html")||mime.equals("application/xhtml+xml"))))throw new IOException();
                int limit=image?12*1024*1024:3*1024*1024;
                ByteArrayOutputStream bytes=new ByteArrayOutputStream();
                try(InputStream in=c.getInputStream()){
                    int n;byte[] buffer=new byte[8192];
                    while((n=in.read(buffer))!=-1){if(bytes.size()+n>limit)throw new IOException();bytes.write(buffer,0,n);}
                }
                if(!page)return new WebResourceResponse(mime,null,new ByteArrayInputStream(bytes.toByteArray()));
                LinkedHashMap<String,String> found=new LinkedHashMap<>();
                LinkedHashMap<String,String> clips=new LinkedHashMap<>();
                if(image)found.put(u.toString(),u.getPath());
                else{
                    org.jsoup.nodes.Document doc=Jsoup.parse(new ByteArrayInputStream(bytes.toByteArray()),null,u.toString());
                    String selection="a[href]"+(photo?",img,meta[property=og:image]":"")+(video?",video[src],video source[src]":"");
                    for(Element el:doc.select(selection)){
                        String url="";
                        if(video){
                            boolean videoElement=el.tagName().equals("video")||el.tagName().equals("source");
                            String targetLink=el.absUrl(videoElement?"src":"href");
                            if(targetLink.startsWith("https://")&&(videoElement||clipLink(targetLink))){
                                if(clips.size()<2048)clips.putIfAbsent(targetLink,doc.title());
                                continue;
                            }
                        }
                        if(!photo)continue;
                        if(el.tagName().equals("img")){
                            for(String attr:new String[]{"data-src","data-original","src"}){url=el.absUrl(attr);if(url.startsWith("https://"))break;}
                            if(!url.startsWith("https://")&&el.hasAttr("srcset")){
                                String first=el.attr("srcset").split(",")[0].trim().split("\\s+")[0];
                                try{url=new URL(u,first).toString();}catch(Exception ignored){}
                            }
                        }else if(el.tagName().equals("meta"))url=el.absUrl("content");
                        else {url=el.absUrl("href");if(!url.matches("(?i).+\\.(jpg|jpeg|png|gif|webp|avif)([?#].*)?"))continue;}
                        if(!url.startsWith("https://"))continue;
                        if(found.size()<2048)found.putIfAbsent(url,el.attr("alt").isEmpty()?doc.title():el.attr("alt"));
                    }
                }
                ArrayList<String> urls=new ArrayList<>(found.keySet());Collections.shuffle(urls);
                JSONArray list=new JSONArray();
                ArrayList<String> videos=new ArrayList<>(clips.keySet());Collections.shuffle(videos);
                for(int n=0;n<Math.max(urls.size(),videos.size());n++){
                    if(n<videos.size()){String link=videos.get(n);list.put(websiteItem(link,clips.get(link),true));}
                    if(n<urls.size()){String link=urls.get(n);list.put(websiteItem(link,found.get(link),false));}
                }
                return websiteResults(list);
            }finally{c.disconnect();}
        }
        throw new IOException();
    }
}

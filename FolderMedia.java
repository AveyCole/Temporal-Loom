package studio.temporal.loom;

import android.content.ContentResolver;
import android.content.res.AssetFileDescriptor;
import android.database.Cursor;
import android.net.Uri;
import android.provider.OpenableColumns;
import android.webkit.WebResourceResponse;
import java.io.*;
import java.util.*;

final class FolderMedia {
    static WebResourceResponse open(ContentResolver resolver, Uri uri, String mime, String range)throws IOException{
        if(uri==null)throw new FileNotFoundException();
        AssetFileDescriptor fd=resolver.openAssetFileDescriptor(uri,"r");
        if(fd==null)throw new FileNotFoundException();
        try{
            if(mime==null)mime=resolver.getType(uri);
            long size=fd.getLength();
            if(size<0)try(Cursor row=resolver.query(uri,new String[]{OpenableColumns.SIZE},null,null,null)){
                if(row!=null && row.moveToFirst()&&!row.isNull(0))size=row.getLong(0);
            }
            long start=0,end=size-1;
            boolean partial=range!=null && size>=0;
            Map<String,String> headers=new HashMap<>();
            if(size>=0)headers.put("Accept-Ranges","bytes");
            if(partial){
                try{
                    if(!range.startsWith("bytes="))throw new IllegalArgumentException();
                    String[] parts=range.substring(6).split("-",-1);
                    if(parts.length!=2)throw new IllegalArgumentException();
                    if(parts[0].isEmpty())start=Math.max(0,size-Long.parseLong(parts[1]));
                    else{
                        start=Long.parseLong(parts[0]);
                        if(!parts[1].isEmpty())end=Math.min(end,Long.parseLong(parts[1]));
                    }
                    if(start<0||start>end)throw new IllegalArgumentException();
                }catch(IllegalArgumentException e){
                    fd.close();headers.put("Content-Range","bytes */"+size);
                    return new WebResourceResponse("text/plain","UTF-8",416,"Range Not Satisfiable",headers,new ByteArrayInputStream(new byte[0]));
                }
                headers.put("Content-Range","bytes "+start+"-"+end+"/"+size);
            }
            InputStream input=fd.createInputStream();
            for(long left=start;left>0;){
                long moved=input.skip(left);
                if(moved==0){if(input.read()==-1)throw new EOFException();moved=1;}
                left-=moved;
            }
            final long length=size<0?-1:end-start+1;
            if(length>=0)headers.put("Content-Length",String.valueOf(length));
            InputStream bounded=new FilterInputStream(input){
                long remaining=length;
                public int read()throws IOException{
                    if(remaining==0)return -1;
                    int n=super.read();if(n>=0 && remaining>0)remaining--;return n;
                }
                public int read(byte[] b,int off,int len)throws IOException{
                    if(len==0)return 0;if(remaining==0)return -1;
                    int n=super.read(b,off,remaining<0?len:(int)Math.min(remaining,len));
                    if(n>0&&remaining>0)remaining-=n;return n;
                }
            };
            return new WebResourceResponse(mime==null?"application/octet-stream":mime,null,partial?206:200,partial?"Partial Content":"OK",headers,bounded);
        }catch(IOException|RuntimeException failure){fd.close();throw failure;}
    }
}

package studio.temporal.loom;

import android.media.*;
import android.view.Surface;
import java.io.*;
import java.nio.ByteBuffer;

/** Produces an indexed MP4 with AVC video and AAC-LC audio. */
final class Mp4Export {
    static boolean isVideo(String mime){return mime.startsWith("video/");}
    static File convert(File source)throws Exception{
        File dir=source.getParentFile(),video=null,audio=null,result=File.createTempFile("loom-share-",".mp4",dir);
        MediaExtractor info=new MediaExtractor();
        boolean ok=false;
        try{
            info.setDataSource(source.getPath());int vi=-1,ai=-1;
            for(int i=0;i<info.getTrackCount();i++){
                String mime=info.getTrackFormat(i).getString(MediaFormat.KEY_MIME);
                if(isVideo(mime))vi=i;
                if(mime.startsWith("audio/"))ai=i;
            }
            if(vi<0)throw new IOException("Clip contains no video");
            if(!"video/avc".equals(info.getTrackFormat(vi).getString(MediaFormat.KEY_MIME)))video=encodeTrack(source,vi,true);
            if(ai>=0 && !"audio/mp4a-latm".equals(info.getTrackFormat(ai).getString(MediaFormat.KEY_MIME)))audio=encodeTrack(source,ai,false);
            merge(result,video==null?source:video,video==null?vi:0,audio==null?source:audio,audio==null?ai:0);
            ok=true;return result;
        }finally{info.release();if(video!=null)video.delete();if(audio!=null)audio.delete();if(!ok)result.delete();}
    }
    static File encodeTrack(File source,int index,boolean video)throws Exception{
        File file=File.createTempFile("loom-track-",".mp4",source.getParentFile());
        MediaExtractor input=new MediaExtractor();MediaMuxer mux=null;
        MediaCodec decoder=null,encoder=null;Surface surface=null;boolean ok=false;
        try{
            input.setDataSource(source.getPath());input.selectTrack(index);
            MediaFormat from=input.getTrackFormat(index),to;
            int rate=video?0:from.getInteger(MediaFormat.KEY_SAMPLE_RATE);
            int channels=video?0:from.getInteger(MediaFormat.KEY_CHANNEL_COUNT);
            if(video){
                int w=from.getInteger(MediaFormat.KEY_WIDTH),h=from.getInteger(MediaFormat.KEY_HEIGHT);
                to=MediaFormat.createVideoFormat("video/avc",(w+1)&~1,(h+1)&~1);
                to.setInteger(MediaFormat.KEY_COLOR_FORMAT,MediaCodecInfo.CodecCapabilities.COLOR_FormatSurface);
                to.setInteger(MediaFormat.KEY_FRAME_RATE,30);
                to.setInteger(MediaFormat.KEY_BIT_RATE,(int)Math.min(42000000,Math.max(18000000,11L*w*h)));
                to.setInteger(MediaFormat.KEY_I_FRAME_INTERVAL,2);
            }else{
                to=MediaFormat.createAudioFormat("audio/mp4a-latm",rate,channels);
                to.setInteger(MediaFormat.KEY_AAC_PROFILE,MediaCodecInfo.CodecProfileLevel.AACObjectLC);
                to.setInteger(MediaFormat.KEY_BIT_RATE,channels==1?96000:128000);
                from.setInteger(MediaFormat.KEY_PCM_ENCODING,AudioFormat.ENCODING_PCM_16BIT);
            }
            encoder=MediaCodec.createEncoderByType(to.getString(MediaFormat.KEY_MIME));
            encoder.configure(to,null,null,MediaCodec.CONFIGURE_FLAG_ENCODE);
            if(video)surface=encoder.createInputSurface();
            encoder.start();
            decoder=MediaCodec.createDecoderByType(from.getString(MediaFormat.KEY_MIME));
            decoder.configure(from,surface,null,0);decoder.start();
            mux=new MediaMuxer(file.getPath(),MediaMuxer.OutputFormat.MUXER_OUTPUT_MPEG_4);
            MediaCodec.BufferInfo raw=new MediaCodec.BufferInfo(),packet=new MediaCodec.BufferInfo();
            boolean inputDone=false,decodeDone=false,encoded=false;int held=-1,used=0,track=-1;
            long lastProgress=android.os.SystemClock.elapsedRealtime();
            while(!encoded){
                boolean progress=false;
                if(!inputDone){
                    int n=decoder.dequeueInputBuffer(1000);
                    if(n>=0){
                        ByteBuffer buf=decoder.getInputBuffer(n);buf.clear();int size=input.readSampleData(buf,0);
                        if(size<0){decoder.queueInputBuffer(n,0,0,0,MediaCodec.BUFFER_FLAG_END_OF_STREAM);inputDone=true;}
                        else{decoder.queueInputBuffer(n,0,size,input.getSampleTime(),0);input.advance();}progress=true;
                    }
                }
                if(!decodeDone && held<0){held=decoder.dequeueOutputBuffer(raw,1000);used=0;if(held>=0)progress=true;}
                if(held>=0){
                    boolean end=(raw.flags&MediaCodec.BUFFER_FLAG_END_OF_STREAM)!=0;
                    if(video){
                        if(raw.size>0)decoder.releaseOutputBuffer(held,Math.max(1,raw.presentationTimeUs*1000));else decoder.releaseOutputBuffer(held,false);
                        held=-1;if(end){encoder.signalEndOfInputStream();decodeDone=true;}progress=true;
                    }else{
                        int n=encoder.dequeueInputBuffer(1000);
                        if(n>=0){
                            ByteBuffer dst=encoder.getInputBuffer(n);dst.clear();
                            int count=Math.min(raw.size-used,dst.remaining());count-=count%(2*channels);
                            if(count>0){
                                ByteBuffer src=decoder.getOutputBuffer(held).duplicate();
                                src.position(raw.offset+used);src.limit(raw.offset+used+count);dst.put(src);
                            }
                            boolean complete=used+count>=raw.size;
                            encoder.queueInputBuffer(n,0,count,Math.max(0,raw.presentationTimeUs+used*1000000L/(rate*channels*2)),end&&complete?MediaCodec.BUFFER_FLAG_END_OF_STREAM:0);
                            used+=count;if(complete){decoder.releaseOutputBuffer(held,false);held=-1;decodeDone=end;}progress=true;
                        }
                    }
                }
                int n=encoder.dequeueOutputBuffer(packet,1000);
                if(n==MediaCodec.INFO_OUTPUT_FORMAT_CHANGED){track=mux.addTrack(encoder.getOutputFormat());mux.start();progress=true;}
                if(n>=0){
                    if(packet.size>0 && (packet.flags&MediaCodec.BUFFER_FLAG_CODEC_CONFIG)==0)mux.writeSampleData(track,encoder.getOutputBuffer(n),packet);
                    encoded=(packet.flags&MediaCodec.BUFFER_FLAG_END_OF_STREAM)!=0;encoder.releaseOutputBuffer(n,false);progress=true;
                }
                long now=android.os.SystemClock.elapsedRealtime();if(progress)lastProgress=now;
                if(now-lastProgress>20000)throw new IOException("Codec timed out");
            }
            mux.stop();ok=true;return file;
        }finally{
            input.release();if(decoder!=null)decoder.release();if(encoder!=null)encoder.release();
            if(surface!=null)surface.release();if(mux!=null)mux.release();if(!ok)file.delete();
        }
    }
    static void merge(File out,File video,int vi,File audio,int ai)throws Exception{
        MediaExtractor[] streams=ai<0?new MediaExtractor[]{new MediaExtractor()}:new MediaExtractor[]{new MediaExtractor(),new MediaExtractor()};
        MediaMuxer mux=new MediaMuxer(out.getPath(),MediaMuxer.OutputFormat.MUXER_OUTPUT_MPEG_4);
        try{
            int[] tracks=new int[streams.length];int capacity=1024*1024;
            for(int i=0;i<streams.length;i++){
                MediaExtractor ex=streams[i];int index=i==0?vi:ai;ex.setDataSource((i==0?video:audio).getPath());ex.selectTrack(index);
                MediaFormat f=ex.getTrackFormat(index);tracks[i]=mux.addTrack(f);
                if(f.containsKey(MediaFormat.KEY_MAX_INPUT_SIZE))capacity=Math.max(capacity,f.getInteger(MediaFormat.KEY_MAX_INPUT_SIZE));
            }
            mux.start();ByteBuffer buffer=ByteBuffer.allocateDirect(capacity);MediaCodec.BufferInfo info=new MediaCodec.BufferInfo();
            while(true){
                int next=-1;
                for(int i=0;i<streams.length;i++)if(streams[i].getSampleTime()>=0 && (next<0||streams[i].getSampleTime()<streams[next].getSampleTime()))next=i;
                if(next<0)break;MediaExtractor ex=streams[next];buffer.clear();int size=ex.readSampleData(buffer,0);if(size<0)throw new IOException("Unreadable sample");
                info.set(0,size,ex.getSampleTime(),(ex.getSampleFlags()&MediaExtractor.SAMPLE_FLAG_SYNC)!=0?MediaCodec.BUFFER_FLAG_KEY_FRAME:0);
                mux.writeSampleData(tracks[next],buffer,info);ex.advance();
            }
            mux.stop();
        }finally{mux.release();for(MediaExtractor ex:streams)ex.release();}
    }
}

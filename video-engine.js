const videoPlayers=new Map();
const stageImages=new Map();
const MAX_FRAGMENTS=512;
const PREVIEW_EDGE=256;
const committedLocalFragments=new Set();
let videoBackgrounded=false;
function makeFragmentVideo(){
 const video=document.createElement('video');
 video.muted=true;video.defaultMuted=true;video.playsInline=true;video.loop=true;video.preload='auto';
 return video;
}
function detachVideo(video){
 video.pause();if(video.srcObject)video.srcObject=null;video.removeAttribute('src');video.load();
}
function copyPreview(media,target,sourceWidth,sourceHeight){
 const scale=Math.min(1,PREVIEW_EDGE/Math.max(sourceWidth,sourceHeight));
 const width=Math.max(1,Math.round(sourceWidth*scale)),height=Math.max(1,Math.round(sourceHeight*scale));
 if(target.width!==width)target.width=width;
 if(target.height!==height)target.height=height;
 target.getContext('2d').drawImage(media,0,0,width,height);
}
function copyVideoFrame(video,target){
 if(video.readyState<2||!video.videoWidth||!video.videoHeight)return false;
 copyPreview(video,target,video.videoWidth,video.videoHeight);
 return true;
}
function thumbnail(preview){
 const target=document.createElement('canvas');
 const ratio=Math.min(1,112/Math.max(preview.width,preview.height));
 target.width=Math.max(1,Math.round(preview.width*ratio));
 target.height=Math.max(1,Math.round(preview.height*ratio));
 target.getContext('2d').drawImage(preview,0,0,target.width,target.height);
 return target.toDataURL('image/webp',.76);
}
async function loadFragment(item){
 if(item.kind==='type')return makeTypeFragment(item.typeSpec);
 const isVideo=item.kind==='video';
 if(isVideo&&item.image.startsWith('/archive-video?'))item=await resolveVideo(item);
 if(isVideo&&/^\/(nasa|peertube)-video\?/.test(item.image))item=await resolveCatalogVideo(item);
 const media=isVideo?makeFragmentVideo():new Image();
 try{
   await new Promise((resolve,reject)=>{
     const timeout=setTimeout(()=>done(Error('Timed out loading '+item.title)),isVideo?30000:18000);
     function done(error){
       clearTimeout(timeout);media.onload=media.onloadeddata=media.onerror=null;
       if(error)reject(error);else resolve();
     }
     if(isVideo)media.onloadeddata=()=>done();else media.onload=()=>done();
     media.onerror=()=>done(Error('Unsupported or unreadable media'));
     media.src=item.image;
   });
   if(isVideo){
     const poster=document.createElement('canvas');
     if(!copyVideoFrame(media,poster))throw Error('No video frame available');
     return {...item,img:poster,poster:thumbnail(poster),resumeAt:0};
   }
   if(!media.naturalWidth || (item.source!=='Local file' && isArchiveEmblem(media)))throw Error('Unavailable image');
   const preview=document.createElement('canvas');
   copyPreview(media,preview,media.naturalWidth,media.naturalHeight);
   return {...item,img:preview,poster:thumbnail(preview)};
 }finally{if(isVideo)detachVideo(media);}
}
function releaseFragment(item){
 const player=videoPlayers.get(item);
 if(player){detachVideo(player);videoPlayers.delete(item);}
 if(item?.image?.startsWith('blob:'))URL.revokeObjectURL(item.image);
 if(item?.liveStream)for(const track of item.liveStream.getTracks())track.stop();
 item?.onRelease?.();
}
function reconcileFragmentDeck(){
 // Studio stays available while Viewfinder owns the visible canvas.
 const retained=new Set(assets);
 if(vf.active && vf.studio)for(const item of vf.studio.assets)retained.add(item);
 for(const item of committedLocalFragments){
   if(retained.has(item))continue;
   releaseFragment(item);committedLocalFragments.delete(item);
 }
 for(const item of retained)if(item.source==='Local file')committedLocalFragments.add(item);
}
function retireVideo(item,video){
 if(video.readyState>=2){
   item.resumeAt=video.currentTime;
   copyVideoFrame(video,item.img);
 }
 detachVideo(video);videoPlayers.delete(item);
}
function playFragment(item){
 const video=makeFragmentVideo();
 videoPlayers.set(item,video);
 video.onloadedmetadata=()=>{
   if(videoPlayers.get(item)!==video)return;
   if(item.resumeAt>0 && item.resumeAt<video.duration)video.currentTime=item.resumeAt;
 };
 if(item.liveStream)video.srcObject=item.liveStream;
 else video.src=item.image;
 video.play().catch(()=>{if(videoPlayers.get(item)===video && !video.paused)video.pause();});
}
function syncFragmentPlayers(){
 const enabled=!frozen&&!document.hidden&&!videoBackgrounded;
 const first=assets[a],second=assets[b];
 // Keep larger stills only for the two fragments currently being blended.
 for(const [item,image] of stageImages)if(item!==first&&item!==second){image.removeAttribute('src');stageImages.delete(item);}
 if(enabled)for(const item of [first,second]){
   if(!item||item.kind==='video'||!item.poster||stageImages.has(item))continue;
   const image=new Image();stageImages.set(item,image);image.src=item.image;
 }
 for(const [item,video] of videoPlayers)if(!enabled||(item!==first&&item!==second))retireVideo(item,video);
 if(!enabled)return;
 if(first?.kind==='video'&&!videoPlayers.has(first))playFragment(first);
 if(second?.kind==='video'&&!videoPlayers.has(second))playFragment(second);
}
function fragmentFrame(item){
 const video=videoPlayers.get(item);
 const image=stageImages.get(item);
 if(video&&video.readyState>=2&&!video.seeking)return video;
 return image?.complete&&image.naturalWidth?image:item.img;
}
function setVideoBackgrounded(hidden){
 videoBackgrounded=hidden;
 syncFragmentPlayers();
}
document.addEventListener('visibilitychange',syncFragmentPlayers);
window.addEventListener('pagehide',()=>setVideoBackgrounded(true));
window.addEventListener('pageshow',()=>setVideoBackgrounded(false));

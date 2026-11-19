const videoPlayers=new Map();
const preparedVideos=new WeakMap();
const videoPlayAttempts=new WeakMap();
const stageImages=new Map();
const MAX_FRAGMENTS=512;
const PREVIEW_EDGE=256;
const committedLocalFragments=new Set();
let videoBackgrounded=false;
let previousIncomingFragment;
const videoStartOptions=[['resume','Resume'],['beginning','Beginning'],['random','Random point']];
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
async function loadFragment(item,prepareForStage){
 if(item.kind==='type')return makeTypeFragment(item.typeSpec);
 const isVideo=item.kind==='video';
 if(isVideo&&item.image.startsWith('/archive-video?'))item=await resolveVideo(item);
 if(isVideo&&/^\/(nasa|peertube)-video\?/.test(item.image))item=await resolveCatalogVideo(item);
 const media=isVideo?makeFragmentVideo():new Image();
 let retained=false;
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
     const asset={...item,img:poster,poster:thumbnail(poster),resumeAt:0};
     if(prepareForStage){preparedVideos.set(asset,media);retained=true;}
     return asset;
   }
   if(!media.naturalWidth || (item.source!=='Local file' && isArchiveEmblem(media)))throw Error('Unavailable image');
   const preview=document.createElement('canvas');
   copyPreview(media,preview,media.naturalWidth,media.naturalHeight);
   return {...item,img:preview,poster:thumbnail(preview)};
 }finally{if(isVideo&&!retained)detachVideo(media);}
}
function discardPreparedVideo(asset){
 const video=preparedVideos.get(asset);
 if(video){preparedVideos.delete(asset);detachVideo(video);}
}
function releaseFragment(item){
 discardPreparedVideo(item);
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
   if(!item.liveStream)item.resumeAt=video.currentTime;
   copyVideoFrame(video,item.img);
 }
 detachVideo(video);videoPlayers.delete(item);
}
function videoStartMode(item){
 return item.videoStart==='beginning'||item.videoStart==='random'?item.videoStart:'resume';
}
function videoStartTime(item,duration,random=Math.random){
 const mode=videoStartMode(item);
 if(mode==='random')return random()*Math.max(0,duration-Math.min(.2,duration*.1));
 if(mode==='resume'&&item.resumeAt>0&&item.resumeAt<duration)return item.resumeAt;
 return 0;
}
function beginVideoPass(item,video){
 if(item.liveStream||!Number.isFinite(video.duration)||video.duration<=0)return;
 const start=videoStartTime(item,video.duration);
 if(video.currentTime!==start)video.currentTime=start;
}
function updateFragmentVideoLoop(item,video){
 video.loop=videoStartMode(item)!=='random'||!Number.isFinite(video.duration)||video.duration<=0;
}
function openFragmentVideo(item){
 const video=preparedVideos.get(item)||makeFragmentVideo();
 preparedVideos.delete(item);
 videoPlayers.set(item,video);
 const configure=()=>{
   if(videoPlayers.get(item)!==video)return;
   updateFragmentVideoLoop(item,video);
   beginVideoPass(item,video);
 };
 video.onloadedmetadata=configure;
 video.onended=()=>{
   if(videoPlayers.get(item)!==video||videoStartMode(item)!=='random'||video.loop)return;
   beginVideoPass(item,video);
 };
 if(item.liveStream)video.srcObject=item.liveStream;
 else if(video.getAttribute('src')===item.image&&video.readyState>=1)configure();
 else video.src=item.image;
 return video;
}
function resumeFragmentVideo(video){
 if(!video.paused||video.error||performance.now()<(videoPlayAttempts.get(video)||0))return;
 videoPlayAttempts.set(video,Infinity);
 video.play().then(()=>videoPlayAttempts.delete(video),()=>{
   // A transient pause or pending seek can interrupt play. Give the decoder time before retrying.
   videoPlayAttempts.set(video,performance.now()+350);
 });
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
 for(const [item,video] of videoPlayers){
   if(item!==first&&item!==second)retireVideo(item,video);
   else if(!enabled&&!video.paused)video.pause();
 }
 if(!enabled)return;
 const incoming=videoPlayers.get(second);
 if(incoming&&second!==first&&second!==previousIncomingFragment&&videoStartMode(second)!=='resume')beginVideoPass(second,incoming);
 previousIncomingFragment=second;
 for(const item of [first,second]){
   if(item?.kind==='video')resumeFragmentVideo(videoPlayers.get(item)||openFragmentVideo(item));
 }
}
function videoStartControl(item){
 const label=document.createElement('label');label.className='fragment-video-start';label.textContent='Video start';
 const select=document.createElement('select');select.setAttribute('aria-label','Video start for '+item.title);
 for(const [value,title] of videoStartOptions)select.add(new Option(title,value));
 select.value=videoStartMode(item);
 select.onchange=()=>{
   item.videoStart=select.value;
   const video=videoPlayers.get(item);
   if(video)updateFragmentVideoLoop(item,video);
 };
 label.append(select);
 return label;
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

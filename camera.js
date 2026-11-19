const cameraPanel=$('cameraPanel'),cameraPreview=$('cameraPreview'),cameraPicker=$('cameraDevice');
const cameraStill=$('cameraStill'),cameraLive=$('cameraLive'),cameraRecord=$('cameraRecord'),cameraStatus=$('cameraStatus');
const cameraIsWindows=Boolean(window.chrome?.webview);
let cameraStream=null,cameraLiveItem=null,cameraRecording=null,cameraOpening=false,cameraRevision=0;

async function listCameras(){
 const selected=cameraPicker.value;
 let devices=[];
 try{devices=await navigator.mediaDevices.enumerateDevices();}catch{}
 cameraPicker.replaceChildren(new Option('Default camera',''));
 if(!cameraIsWindows)cameraPicker.add(new Option('Rear camera','environment'));
 if(!cameraIsWindows)cameraPicker.add(new Option('Front camera','user'));
 devices.filter(device=>device.kind==='videoinput'&&device.deviceId).forEach((device,index)=>{
   cameraPicker.add(new Option(device.label||'Camera '+(index+1),'device:'+device.deviceId));
 });
 if(Array.from(cameraPicker.options).some(option=>option.value===selected))cameraPicker.value=selected;
}

function setCameraControls(){
 const active=Boolean(cameraStream),ready=active&&cameraPreview.readyState>=2;
 cameraPicker.disabled=cameraOpening||active;
 cameraPreview.hidden=!active;
 cameraStill.disabled=!ready;
 cameraLive.disabled=!ready||Boolean(cameraLiveItem);
 cameraRecord.disabled=(!ready&&!cameraRecording)||(cameraRecording?.recorder.state==='inactive');
 cameraRecord.textContent=cameraRecording?'Finish camera clip':'Record camera clip';
 cameraRecord.setAttribute('aria-pressed',String(Boolean(cameraRecording)));
 if($('source').value==='camera'){
   $('excavate').disabled=cameraOpening;
   $('excavate').textContent=active?'Stop camera':'Open camera';
 }
}

function dropLiveCamera(){
 const item=cameraLiveItem;
 if(!item)return;
 const index=assets.indexOf(item);
 if(index>=0)removeFragment(index);
 else releaseFragment(item);
}

function stopCameraCapture(keepClip=false){
 ++cameraRevision;cameraOpening=false;
 if(cameraRecording){
   cameraRecording.keep=keepClip;
   if(cameraRecording.recorder.state!=='inactive')cameraRecording.recorder.stop();
 }
 const stream=cameraStream;
 cameraStream=null;cameraPreview.srcObject=null;
 dropLiveCamera();
 if(stream)for(const track of stream.getTracks())track.stop();
 cameraStatus.textContent='';setCameraControls();
}

function showCameraSource(visible){
 if(!visible&&(cameraStream||cameraOpening||cameraRecording))stopCameraCapture();
 cameraPanel.hidden=!visible;
 if(visible){listCameras();setCameraControls();}
}

async function toggleCameraCapture(){
 if(cameraStream){stopCameraCapture(true);return;}
 if(cameraOpening)return;
 if(!navigator.mediaDevices?.getUserMedia){cameraStatus.textContent='Camera capture is unavailable here.';return;}
 const revision=++cameraRevision;
 cameraOpening=true;setCameraControls();cameraStatus.textContent='Opening camera…';
 const selected=cameraPicker.value;
 const video={width:{ideal:1280},height:{ideal:720},frameRate:{ideal:30,max:30}};
 if(selected.startsWith('device:'))video.deviceId={exact:selected.slice(7)};
 else if(selected)video.facingMode={exact:selected};
 else if(!cameraIsWindows)video.facingMode={ideal:'environment'};
 try{
   const stream=await navigator.mediaDevices.getUserMedia({video,audio:false});
   if(revision!==cameraRevision){stream.getTracks().forEach(track=>track.stop());return;}
   cameraStream=stream;cameraPreview.srcObject=stream;cameraPreview.hidden=false;
   stream.getVideoTracks()[0].addEventListener('ended',()=>{
     if(cameraStream===stream){stopCameraCapture();cameraStatus.textContent='The camera disconnected.';}
   },{once:true});
   await cameraPreview.play();
   if(revision!==cameraRevision)return;
   cameraStatus.textContent='Camera ready.';listCameras();
 }catch(error){
   if(revision!==cameraRevision)return;
   if(cameraStream)stopCameraCapture();
   cameraStatus.textContent=error.name==='NotAllowedError'?'Camera permission was denied.':
     ['NotFoundError','OverconstrainedError'].includes(error.name)?'This camera is unavailable. Try Default camera.':
     'Could not start the camera. Close other apps using it and try again.';
 }finally{if(revision===cameraRevision){cameraOpening=false;setCameraControls();}}
}

function roomForCamera(){
 if(vf.active||$('source').value!=='camera')return false;
 if(assets.length<MAX_FRAGMENTS)return true;
 cameraStatus.textContent='Remove a fragment to make room.';return false;
}

function addCameraToDeck(item){
 ++searchToken;
 const index=assets.length;assets.push(item);showAssets(index);selectDeckFragment(index);
 cameraStatus.textContent=item.title+' added to the deck.';
}

async function addRecordedCameraMedia(blob,kind,title,duration){
 if(!blob?.size||!roomForCamera())return;
 const url=URL.createObjectURL(blob);
 const item={title,date:'Camera capture',kind,source:'Local file',image:url,silent:true,durationHint:duration};
 let ready;
 try{
   ready=await loadFragment(item,true);
   if(!roomForCamera()){releaseFragment(ready);return;}
   addCameraToDeck(ready);
 }catch{
   URL.revokeObjectURL(url);cameraStatus.textContent='Could not add the camera capture.';
 }finally{if(ready)discardPreparedVideo(ready);}
}

cameraStill.onclick=()=>{
 if(!roomForCamera()||cameraPreview.readyState<2)return;
 const frame=document.createElement('canvas');frame.width=cameraPreview.videoWidth;frame.height=cameraPreview.videoHeight;
 if(!frame.width||!frame.height)return;
 frame.getContext('2d').drawImage(cameraPreview,0,0);
 frame.toBlob(blob=>addRecordedCameraMedia(blob,'image','Camera still'),'image/webp',.9);
};

cameraLive.onclick=()=>{
 if(!cameraStream||!roomForCamera()||cameraLiveItem)return;
 const preview=document.createElement('canvas');
 if(!copyVideoFrame(cameraPreview,preview))return;
 const track=cameraStream.getVideoTracks()[0].clone();
 const item={title:'Live camera',date:'Camera capture',source:'Local file',kind:'video',silent:true,
   liveStream:new MediaStream([track]),image:'',img:preview,poster:thumbnail(preview),resumeAt:0,
   onRelease(){if(cameraLiveItem===item){cameraLiveItem=null;setCameraControls();}}};
 track.addEventListener('ended',dropLiveCamera,{once:true});
 cameraLiveItem=item;
 addCameraToDeck(item);setCameraControls();
};

cameraRecord.onclick=()=>{
 if(cameraRecording){cameraRecording.recorder.stop();setCameraControls();return;}
 if(!cameraStream||!roomForCamera())return;
 if(typeof MediaRecorder==='undefined'){cameraStatus.textContent='This device cannot record a camera clip.';return;}
 try{
   const mime=['video/webm;codecs=vp8','video/mp4','video/webm'].find(type=>MediaRecorder.isTypeSupported(type));
   const recorder=new MediaRecorder(cameraStream,{...(mime?{mimeType:mime}:{}),videoBitsPerSecond:4000000});
   const recording={recorder,chunks:[],keep:true,start:performance.now()};
   recorder.ondataavailable=event=>{if(event.data.size)recording.chunks.push(event.data);};
   recorder.onstop=()=>{
     clearTimeout(recording.limit);cameraRecording=null;setCameraControls();
     if(recording.keep){
       const duration=(performance.now()-recording.start)/1000;
       const clip=new Blob(recording.chunks,{type:recorder.mimeType||recording.chunks[0]?.type||'video/webm'});
       addRecordedCameraMedia(clip,'video','Camera clip',duration);
     }
   };
   recorder.onerror=()=>{recording.keep=false;cameraStatus.textContent='Camera recording failed.';};
   recorder.start(1000);
   cameraRecording=recording;
   recording.limit=setTimeout(()=>{if(recorder.state!=='inactive'){recorder.stop();setCameraControls();}},120000);
   cameraStatus.textContent='Recording camera clip · up to 2 minutes.';setCameraControls();
 }catch{cameraStatus.textContent='Could not record from this camera.';}
};

cameraPreview.addEventListener('loadeddata',setCameraControls);
navigator.mediaDevices?.addEventListener('devicechange',()=>{if(!cameraPanel.hidden)listCameras();});
window.addEventListener('pagehide',()=>{if(cameraStream||cameraOpening)stopCameraCapture();});

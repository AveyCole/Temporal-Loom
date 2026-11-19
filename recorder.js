let clipRecorder=null,clipWrites=Promise.resolve(),clipStream=null,clipFailed=false;
const recordButton=$('recordClip');
function clipStatus(message){$('clipStatus').textContent=message;}
function releaseClip(){
 if(clipStream)for(const track of clipStream.getTracks())track.stop();
 clipStream=null;clipRecorder=null;recordButton.disabled=false;
 recordButton.textContent='Record';recordButton.setAttribute('aria-pressed','false');
}
function encodeChunk(blob){
 return new Promise((resolve,reject)=>{
   const reader=new FileReader();reader.onload=()=>resolve(reader.result.split(',')[1]);
   reader.onerror=reject;reader.readAsDataURL(blob);
 });
}
async function startClip(){
 recordButton.disabled=true;
 try{
   if(!canvas.captureStream||typeof MediaRecorder==='undefined')throw Error('Video recording is unavailable in this Android WebView.');
   await ensureAudio();
   clipStream=canvas.captureStream(30);
   for(const track of clipAudio.stream.getAudioTracks())clipStream.addTrack(track.clone());
   const mime=['video/mp4;codecs=avc1.42E01E,mp4a.40.2','video/mp4;codecs=avc1,opus','video/webm;codecs=vp8,opus','video/webm'].find(t=>MediaRecorder.isTypeSupported(t));
   if(!mime)throw Error('No supported recording format on this device.');
   clipRecorder=new MediaRecorder(clipStream,{mimeType:mime,videoBitsPerSecond:4000000});
   if(!Mic.beginClip(mime.startsWith('video/mp4')?'mp4':'webm'))throw Error('Could not start the clip file.');
   clipWrites=Promise.resolve();clipFailed=false;
   clipRecorder.ondataavailable=event=>{
     if(!event.data.size)return;
     clipWrites=clipWrites.then(async()=>{
       if(clipFailed)return;
       for(let pos=0;pos<event.data.size;pos+=131072){
         const data=await encodeChunk(event.data.slice(pos,pos+131072));
         if(!Mic.writeClip(data))throw Error('Could not write the clip.');
       }
     }).catch(()=>{clipFailed=true;stopClip();});
   };
   clipRecorder.onerror=()=>{clipFailed=true;stopClip();};
   clipRecorder.onstop=async()=>{
     await clipWrites;
     if(clipFailed){Mic.discardClip();clipStatus('Recording failed. Check available storage.');}
     else {Mic.finishClip();clipStatus('Preparing MP4…');}
     releaseClip();
   };
   clipRecorder.start(500);recordButton.disabled=false;recordButton.textContent='Finish clip';
   recordButton.setAttribute('aria-pressed','true');clipStatus('Recording');
 }catch(error){Mic.discardClip();releaseClip();clipStatus(error.message||'Could not start recording.');}
}
function stopClip(){
 if(clipRecorder && clipRecorder.state!=='inactive'){
   recordButton.disabled=true;clipStatus('Finishing clipâ€¦');clipRecorder.stop();
 }
}
let clipArmed=false;
const triggerInput=$('recTrigger');
const thresholdInput=$('recThreshold');
triggerInput.value=localStorage.getItem('recTrigger')==='armed'?'armed':'immediate';
$('recThresholdField').hidden=triggerInput.value!=='armed';
thresholdInput.value=localStorage.getItem('recThreshold')||15;
thresholdInput.onchange=()=>{thresholdInput.value=Math.max(1,Math.min(100,Number(thresholdInput.value)||15));localStorage.setItem('recThreshold',thresholdInput.value);};
function disarmClip(){
 clipArmed=false;recordButton.textContent='Record';recordButton.setAttribute('aria-pressed','false');clipStatus('');
}
function triggerClip(){
 if(!clipArmed)return;
 disarmClip();startClip();
}
function checkClipGate(){
 if(clipArmed && (!fileAudio.paused || ($('micButton').textContent==='Mic on' && Mic.amplitude()*100>=Number(thresholdInput.value))))triggerClip();
}
triggerInput.onchange=()=>{
 localStorage.setItem('recTrigger',triggerInput.value);
 $('recThresholdField').hidden=triggerInput.value!=='armed';
 if(clipArmed)disarmClip();
};
fileAudio.addEventListener('playing',triggerClip);
recordButton.onclick=()=>{
 if(clipRecorder){stopClip();return;}
 if(clipArmed){disarmClip();return;}
 if(triggerInput.value==='immediate'||!fileAudio.paused){startClip();return;}
 // Resume the audio graph on the user's tap before a later microphone trigger.
 ensureAudio().catch(()=>{if(clipArmed){disarmClip();clipStatus('Audio input unavailable.');}});
 clipArmed=true;recordButton.textContent='Cancel arm';recordButton.setAttribute('aria-pressed','true');clipStatus('Armed · waiting for playback or live mic');checkClipGate();
};

$('shareClip').onclick=()=>Mic.shareClip();

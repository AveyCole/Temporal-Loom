let clipRecorder=null,clipWrites=Promise.resolve(),clipStream=null,clipFailed=false;
let clipResolution=null;
let clipFileGain,clipMicGain,clipMicSource,clipMicStream,clipMicToken=0,nextClipMicToken=0,clipMicCursor=0;
const scheduledMic=new Set();
const recordButton=$('recordClip');
function clipStatus(message){$('clipStatus').textContent=message;}
function lockClipResolution(){
 const width=Math.max(1,canvas.width),height=Math.max(1,canvas.height);
 const scale=Math.max(1,1920/Math.max(width,height));
 const even=value=>Math.max(2,Math.round(value/2)*2);
 clipResolution={width:even(width*scale),height:even(height*scale)};
 const still=frozen?document.createElement('canvas'):null;
 if(still){still.width=width;still.height=height;still.getContext('2d').drawImage(canvas,0,0);}
 canvas.width=clipResolution.width;canvas.height=clipResolution.height;
 if(still)ctx.drawImage(still,0,0,canvas.width,canvas.height);
}
function connectClipAudio(){
 clipAudio=audioContext.createMediaStreamDestination();
 clipFileGain=audioContext.createGain();clipMicGain=audioContext.createGain();
 analyser.connect(clipFileGain);clipFileGain.connect(clipAudio);clipMicGain.connect(clipAudio);
}
function clipMicEnabled(){return clipRecorder?.state==='recording'&&$('micButton').textContent==='Mic on';}
function syncClipMix(){
 if(!clipFileGain)return;
 const mixed=clipMicEnabled()&&!fileAudio.paused;
 const now=audioContext.currentTime;
 clipFileGain.gain.setTargetAtTime(mixed ? .48 : 1,now,.007);
 clipMicGain.gain.setTargetAtTime(mixed ? .48 : .85,now,.007);
}
function stopNativeClipMic(){
 if(!clipMicToken)return;
 clipMicToken=0;clipMicCursor=0;
 Mic.captureClipMic?.(0);
 for(const source of scheduledMic){source.stop();source.disconnect();}
 scheduledMic.clear();
}
function syncClipMic(){
 if(!clipMicGain)return;
 const enabled=clipMicEnabled(),stream=enabled?(Mic.recordingStream?.()||null):null;
 if(stream!==clipMicStream){
   if(clipMicSource)clipMicSource.disconnect();
   clipMicSource=stream?audioContext.createMediaStreamSource(stream):null;
   if(clipMicSource)clipMicSource.connect(clipMicGain);
   clipMicStream=stream;
 }
 if(enabled&&!stream&&typeof Mic.captureClipMic==='function'){
   if(!clipMicToken){clipMicToken=++nextClipMicToken;Mic.captureClipMic(clipMicToken);}
 }else stopNativeClipMic();
 if(clipRecorder?.state==='recording')clipStatus(enabled?'Recording · Mic included':'Recording');
 syncClipMix();
}

function clipMicPcm(token,base64,rate,channels){
 if(token!==clipMicToken||!token||!clipMicEnabled()||audioContext.state!=='running')return;
 const now=audioContext.currentTime;
 if(clipMicCursor>now+.12)return;
 const bytes=atob(base64),frames=Math.floor(bytes.length/(channels*2));
 if(!frames)return;
 const buffer=audioContext.createBuffer(channels,frames,rate);
 for(let channel=0;channel<channels;channel++){
   const output=buffer.getChannelData(channel);
   for(let i=0;i<frames;i++){
     const at=(i*channels+channel)*2;
     const sample=bytes.charCodeAt(at)|bytes.charCodeAt(at+1)<<8;
     output[i]=(sample<<16>>16)/32768;
   }
 }
 const source=audioContext.createBufferSource();source.buffer=buffer;source.connect(clipMicGain);
 source.onended=()=>{scheduledMic.delete(source);source.disconnect();};
 scheduledMic.add(source);
 const start=clipMicCursor>now?clipMicCursor:now+(window.chrome?.webview ? .012 : .09);
 source.start(start);clipMicCursor=start+buffer.duration;
}
for(const event of ['play','pause','ended','emptied'])fileAudio.addEventListener(event,syncClipMix);
function releaseClip(){
 if(clipStream)for(const track of clipStream.getTracks())track.stop();
 clipStream=null;clipRecorder=null;recordButton.disabled=false;
 clipResolution=null;
 syncClipMic();
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
   lockClipResolution();
   clipStream=canvas.captureStream(30);
   for(const track of clipAudio.stream.getAudioTracks())clipStream.addTrack(track.clone());
   const mime=['video/mp4;codecs=avc1.42E01E,mp4a.40.2','video/mp4;codecs=avc1,opus','video/webm;codecs=vp8,opus','video/webm'].find(t=>MediaRecorder.isTypeSupported(t));
   if(!mime)throw Error('No supported recording format on this device.');
   const bitrate=Math.min(42000000,Math.max(18000000,Math.round(canvas.width*canvas.height*11)));
   clipRecorder=new MediaRecorder(clipStream,{mimeType:mime,videoBitsPerSecond:bitrate,audioBitsPerSecond:192000});
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
     syncClipMic();
     await clipWrites;
     if(clipFailed){Mic.discardClip();clipStatus('Recording failed. Check available storage.');}
     else {Mic.finishClip();clipStatus('Preparing MP4…');}
     releaseClip();
   };
   clipRecorder.start(500);recordButton.disabled=false;recordButton.textContent='Finish clip';
   recordButton.setAttribute('aria-pressed','true');syncClipMic();
 }catch(error){Mic.discardClip();releaseClip();clipStatus(error.message||'Could not start recording.');}
}
function stopClip(){
 if(clipRecorder && clipRecorder.state!=='inactive'){
   recordButton.disabled=true;clipStatus('Finishing clip…');clipRecorder.stop();syncClipMic();
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

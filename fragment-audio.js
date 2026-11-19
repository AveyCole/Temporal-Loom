let streamAudioSource=null;
let fragmentSoundtrack=null;
const restoreFragmentAudioButton=$('restoreFragmentAudio');

function captureAudioState(){
 const stream=fileAudio.srcObject;
 return {src:fileAudio.getAttribute('src'),stream,time:stream?0:fileAudio.currentTime,
   name:$('audioName').textContent,driver:$('driver').value,playing:!fileAudio.paused&&!fileAudio.ended};
}
function restoreAudioSource(state){
 assignAudioMedia(state.src,state.stream);
 if(state.src&&!state.stream&&state.time>0)fileAudio.currentTime=state.time;
 $('audioName').textContent=state.name;
}
function setFragmentSoundtrack(soundtrack){
 fragmentSoundtrack=soundtrack;
 restoreFragmentAudioButton.hidden=!soundtrack;
}
function discardFragmentAudio(){
 if(fragmentSoundtrack?.url)URL.revokeObjectURL(fragmentSoundtrack.url);
 setFragmentSoundtrack(null);
}
function restorePreviousAudio(){
 if(!fragmentSoundtrack)return;
 const previous=fragmentSoundtrack.previous;
 restoreAudioSource(previous);
 discardFragmentAudio();
 if($('driver').value==='audio'){
   $('driver').value=previous.driver;
   $('driver').onchange();
 }
 if(previous.playing)fileAudio.play().catch(()=>{});
 report(previous.src||previous.stream?'Previous audio restored.':'Video audio stopped.');
}
restoreFragmentAudioButton.onclick=restorePreviousAudio;

function assignAudioMedia(url,stream=null){
 fileAudio.pause();
 if(fileAudio.srcObject!==stream)fileAudio.srcObject=stream;
 if(url&&fileAudio.getAttribute('src')!==url)fileAudio.src=url;
 else if(!url){fileAudio.removeAttribute('src');if(!stream)fileAudio.load();}
 updateAudioGraph();
 syncAudioTransport();
}
function updateAudioGraph(){
 if(!fileSource||!analyser)return;
 fileSource.disconnect();
 if(streamAudioSource){streamAudioSource.disconnect();streamAudioSource=null;}
 if(fileAudio.srcObject){
   // Shared audio already plays in the browser. Analyze and record it without monitoring it twice.
   audioMonitor.gain.value=0;
   if(!fileAudio.paused){streamAudioSource=audioContext.createMediaStreamSource(fileAudio.srcObject);streamAudioSource.connect(analyser);}
 }else{
   audioMonitor.gain.value=1;
   fileSource.connect(analyser);
 }
}
for(const event of ['play','pause','ended','emptied'])fileAudio.addEventListener(event,updateAudioGraph);
async function useFragmentAudio(asset){
 const tracks=(asset.liveStream?.getAudioTracks()||[]).filter(track=>track.readyState==='live');
 if(asset.liveStream&&!tracks.length){report('This window has no shared audio. Use a browser tab with audio sharing or choose another input.');return;}
 const previous=fragmentSoundtrack?.previous||captureAudioState();
 const oldURL=fragmentSoundtrack?.url;
 const soundtrack={previous,url:asset.file?URL.createObjectURL(asset.file):null};
 assignAudioMedia(asset.liveStream?null:(soundtrack.url||asset.image),tracks.length?new MediaStream(tracks):null);
 if(oldURL)URL.revokeObjectURL(oldURL);
 setFragmentSoundtrack(soundtrack);
 $('audioName').textContent=asset.title;
 $('driver').value='audio';$('driver').onchange();
 try{
   const ready=ensureAudio();
   await Promise.all([ready,fileAudio.play()]);
   if(fragmentSoundtrack===soundtrack)report('Using audio from '+asset.title+'.');
 }catch{
   if(fragmentSoundtrack!==soundtrack)return;
   restorePreviousAudio();
   report('Could not play this fragment’s audio.');
 }
}

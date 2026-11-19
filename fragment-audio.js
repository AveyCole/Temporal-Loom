let streamAudioSource=null;
let connectedAudioStream=null;
let fileSourceAttached=false;
let fragmentSoundtrack=null;
let loadedAudioFile=null,loadedDecodedAudio=null;
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
 releaseSoundtrack(fragmentSoundtrack);
 setFragmentSoundtrack(null);
}
function releaseSoundtrack(soundtrack){
 if(soundtrack?.url)URL.revokeObjectURL(soundtrack.url);
 if(soundtrack?.decoded)Mic.releaseVideoAudio?.(soundtrack.decoded);
}
function rememberAudioFile(file){
 if(loadedDecodedAudio)Mic.releaseVideoAudio?.(loadedDecodedAudio);
 loadedDecodedAudio=null;
 loadedAudioFile=file.type.startsWith('video/')||/\.(mp4|m4v|mov|mkv|webm|3gp)$/i.test(file.name)?file:null;
}
function canDecodeLoadedAudio(){
 return Boolean(loadedAudioFile&&typeof Mic.decodeVideoAudio==='function'&&fileAudio.getAttribute('src')===audioURL);
}
function hasVideoSoundtrack(){
 if(fileAudio.srcObject)return fileAudio.srcObject.getAudioTracks().some(track=>track.readyState==='live');
 if(typeof fileAudio.captureStream!=='function')return true;
 try{
   const tracks=fileAudio.captureStream().getTracks();
   const hasAudio=tracks.some(track=>track.kind==='audio');
   for(const track of tracks)track.stop();
   return hasAudio;
 }catch{return true;}
}
async function playLoadedAudio(){
 const source=fileAudio.getAttribute('src'),fallback=canDecodeLoadedAudio(),file=loadedAudioFile;
 try{
   await Promise.all([ensureAudio(),fileAudio.play()]);
   if(!fallback||hasVideoSoundtrack())return;
 }catch(error){if(!fallback||error.name==='NotAllowedError')throw error;}
 if(fileAudio.getAttribute('src')!==source)return;
 report('Preparing the video’s audio…');
 const decoded=await Mic.decodeVideoAudio({file});
 if(fileAudio.getAttribute('src')!==source){if(decoded)Mic.releaseVideoAudio(decoded);return;}
 if(!decoded)throw Error('This video has no playable soundtrack.');
 loadedDecodedAudio=decoded;
 assignAudioMedia(decoded);
 await fileAudio.play();
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
 const attachFile=!fileAudio.srcObject;
 if(fileSourceAttached!==attachFile){
   if(attachFile)fileSource.connect(analyser);else fileSource.disconnect();
   fileSourceAttached=attachFile;
 }
 const stream=fileAudio.paused?null:fileAudio.srcObject;
 if(connectedAudioStream!==stream){
   if(streamAudioSource)streamAudioSource.disconnect();
   streamAudioSource=stream?audioContext.createMediaStreamSource(stream):null;
   if(streamAudioSource)streamAudioSource.connect(analyser);
   connectedAudioStream=stream;
 }
 // Shared audio already plays in the browser. Analyze and record it without monitoring it twice.
 audioMonitor.gain.value=fileAudio.srcObject?0:1;
}
for(const event of ['play','pause','ended','emptied'])fileAudio.addEventListener(event,updateAudioGraph);
async function useFragmentAudio(asset){
 const tracks=(asset.liveStream?.getAudioTracks()||[]).filter(track=>track.readyState==='live');
 if(asset.liveStream&&!tracks.length){report('This window has no shared audio. Use a browser tab with audio sharing or choose another input.');return;}
 const previous=fragmentSoundtrack?.previous||captureAudioState();
 const previousSoundtrack=fragmentSoundtrack;
 const soundtrack={previous,url:asset.file?URL.createObjectURL(asset.file):null};
 const sound=tracks.length?new MediaStream(tracks):null;
 const base=soundtrack.url||asset.image;
 const companion=asset.audio?.startsWith('/web-audio?')?asset.audio:null;
 assignAudioMedia(sound?null:(companion||base),sound);
 releaseSoundtrack(previousSoundtrack);
 setFragmentSoundtrack(soundtrack);
 $('audioName').textContent=asset.title;
 $('driver').value='audio';$('driver').onchange();
 try{
   const ready=ensureAudio();
   const tryCurrent=async()=>{
     try{await Promise.all([ready,fileAudio.play()]);return hasVideoSoundtrack();}
     catch(error){if(error.name==='NotAllowedError')throw error;return false;}
   };
   let playing=await tryCurrent();
   if(!playing&&companion&&fragmentSoundtrack===soundtrack){
     assignAudioMedia(base);
     playing=await tryCurrent();
   }
   if(!playing&&fragmentSoundtrack===soundtrack&&typeof Mic.decodeVideoAudio==='function'&&(asset.file||asset.image?.startsWith('/folder/'))){
     report('Preparing the video’s audio…');
     const decoded=await Mic.decodeVideoAudio(asset);
     if(fragmentSoundtrack!==soundtrack){if(decoded)Mic.releaseVideoAudio(decoded);return;}
     if(decoded){
       soundtrack.decoded=decoded;
       assignAudioMedia(decoded);
       playing=await tryCurrent();
     }
   }
   if(!playing)throw Error('This video has no playable soundtrack.');
   if(fragmentSoundtrack===soundtrack)report('Using audio from '+asset.title+'.');
 }catch(error){
   if(fragmentSoundtrack!==soundtrack)return;
   if(error.name==='NotAllowedError'){report('Tap Play to hear '+asset.title+'.');return;}
   restorePreviousAudio();
   report(error.message||'Could not play this fragment’s audio.');
 }
}

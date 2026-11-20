const Mic=(()=>{
 const send=(action,fields={})=>window.chrome.webview.postMessage({action,...fields});
 const clip=window.chrome.webview.hostObjects.sync.loomClip;
 const devicePicker=document.getElementById('micDevice');
 const channelPicker=document.getElementById('micChannel');
 const channelField=document.getElementById('micChannelField');
 const signal=document.getElementById('micSignal');
 let deviceId=localStorage.getItem('windowsMicInput')||'';
 let asioDevices=[],asioDriver='',asioValues=[],asioBands=null,asioReply,enumeration=0;
 let stream,context,meter,samples,micSpectrumReader,pending=false,level=0,detailed=false;
 let audioRequestId=0;
 const audioRequests=new Map();
 function decodeVideoAudio(asset){
   const file=asset.file;
   if(!file&&!asset.image?.startsWith('/folder/'))return Promise.resolve(null);
   const id=++audioRequestId;
   return new Promise(resolve=>{
     const timer=setTimeout(()=>{audioRequests.delete(id);resolve(null);},58000);
     audioRequests.set(id,url=>{clearTimeout(timer);audioRequests.delete(id);resolve(url);});
     try{
       if(file)window.chrome.webview.postMessageWithAdditionalObjects({action:'decodeVideoAudio',id,source:''},[file]);
       else send('decodeVideoAudio',{id,source:asset.image});
     }catch{audioRequests.get(id)(null);}
   });
 }
 function releaseVideoAudio(url){if(url)send('releaseVideoAudio',{url});}
 async function listInputs(){
   const request=++enumeration;
   let devices;
   try{devices=await navigator.mediaDevices?.enumerateDevices()||[];}catch{devices=[];}
   if(request!==enumeration)return;
   const inputs=devices.filter(device=>device.kind==='audioinput'&&device.deviceId&&!['default','communications'].includes(device.deviceId));
   devicePicker.replaceChildren(new Option('System default',''));
   for(const name of asioDevices)devicePicker.add(new Option(name,'asio:'+name));
   inputs.forEach((device,index)=>devicePicker.add(new Option(device.label||'Microphone '+(index+1),device.deviceId)));
   if(deviceId&&!Array.from(devicePicker.options).some(option=>option.value===deviceId))devicePicker.add(new Option('Saved microphone',deviceId));
   devicePicker.value=deviceId;
 }
 async function toggle(){
   if(pending)return;
   if(stream||asioDriver){stopInput();stopAsio();micState('Mic off');return;}
   await chooseInput(deviceId);
 }
 function stopAsio(){
   if(!asioDriver)return;
   asioDriver='';clearAsioLevels();channelField.hidden=true;
   send('asioStop');
 }
 function clearAsioLevels(){
   asioValues=[];
   asioBands=null;
   signal.value=0;
 }
 function selectAsioChannels(){
   const [left,right=-1]=channelPicker.value.split(',').map(Number);
   clearAsioLevels();
   send('asioChannels',{left,right});
 }
 function installAsioChannels(driver,channels,pairs){
   const mono=document.createElement('optgroup');
   mono.label='Individual inputs';
   mono.append(...channels.map((label,index)=>new Option(label,index)));
   channelPicker.replaceChildren(mono);
   if(pairs.length){
     const stereo=document.createElement('optgroup');
     stereo.label='Stereo pairs';
     stereo.append(...pairs.map((label,pair)=>new Option(label,`${pair*2},${pair*2+1}`)));
     channelPicker.append(stereo);
   }
   const stored=localStorage.getItem('windowsAsioChannel:'+driver)||'0';
   channelPicker.value=Array.from(channelPicker.options).some(option=>option.value===stored)?stored:'0';
   channelField.hidden=false;
   selectAsioChannels();
 }
 async function chooseInput(id){
   if(!id.startsWith('asio:')){
     stopAsio();
     return openInput(id);
   }
   if(pending)return false;
   stopInput();stopAsio();
   pending=true;devicePicker.disabled=true;
   const driver=id.slice(5);
   try{
     const info=await new Promise(resolve=>{asioReply=resolve;send('asioOpen',{driver});});
     if(info.error){micState('Mic off');report(info.error);return false;}
     asioDriver=driver;
     installAsioChannels(driver,info.channels,info.stereo);
     micState('Mic on');
     report('ASIO input active. Choose a channel.');
     return true;
   }finally{pending=false;devicePicker.disabled=false;}
 }
 async function openInput(id){
   if(pending)return false;
   pending=true;devicePicker.disabled=true;
   let next=null,nextContext=null;
   try{
     const audio={autoGainControl:false,echoCancellation:false,noiseSuppression:false};
     if(id)audio.deviceId={exact:id};
     next=await navigator.mediaDevices.getUserMedia({audio});
     nextContext=new AudioContext();
     await nextContext.resume();
     const nextMeter=nextContext.createAnalyser();
     nextContext.createMediaStreamSource(next).connect(nextMeter);
     stopInput();
     stream=next;context=nextContext;meter=nextMeter;configureMicMeter();
     stream.getAudioTracks()[0].onended=()=>{stopInput();micState('Mic off');};
     micState('Mic on');
     return true;
   }catch{
     if(next)for(const track of next.getTracks())track.stop();
     if(nextContext)nextContext.close().catch(()=>{});
     if(!stream)micState('Mic off');
     report('Microphone unavailable. Check Windows microphone access and the selected input device.');
     return false;
   }finally{pending=false;devicePicker.disabled=false;listInputs();}
 }
 function stopInput(){
   if(stream)for(const track of stream.getTracks())track.stop();
   if(context)context.close().catch(()=>{});
   stream=context=meter=samples=null;level=0;
   micSpectrumReader=null;
 }
 function amplitude(){
   if(asioDriver){
     const [left,right]=channelPicker.value.split(',').map(Number);
     const leftLevel=asioValues[left]||0;
     return right===undefined?leftLevel:Math.hypot(leftLevel,asioValues[right]||0)*Math.SQRT1_2;
   }
   if(!meter)return 0;
   meter.getFloatTimeDomainData(samples);
   let square=0;for(const sample of samples)square+=sample*sample;
   level=Math.min(1,Math.sqrt(square/samples.length)*9.36);
   return level;
 }
 function spectrum(){
   if(asioDriver)return asioBands;
   if(!meter)return null;
   micSpectrumReader??=makeSpectrumReader();
   return micSpectrumReader(meter,context.sampleRate);
 }
 function configureMicMeter(){
   if(!meter)return;
   meter.fftSize=detailed?2048:1024;meter.smoothingTimeConstant=detailed ? .16 : .8;
   samples=new Float32Array(meter.fftSize);micSpectrumReader=null;
 }
 function setDetailedAnalysis(enabled){
   if(detailed===enabled)return;
   detailed=enabled;asioBands=null;configureMicMeter();send('asioAnalysis',{enabled});
 }
 window.addEventListener('pagehide',stopInput);
 channelPicker.onchange=()=>{
   if(!asioDriver)return;
   localStorage.setItem('windowsAsioChannel:'+asioDriver,channelPicker.value);
   selectAsioChannels();
 };
 document.getElementById('asioSettings').onclick=()=>send('asioSettings');
 devicePicker.onchange=async()=>{
   const selected=devicePicker.value;
   if((stream||asioDriver)&&!await chooseInput(selected)){devicePicker.value=deviceId;return;}
   deviceId=selected;localStorage.setItem('windowsMicInput',deviceId);devicePicker.value=deviceId;
 };
 navigator.mediaDevices?.addEventListener('devicechange',listInputs);
 listInputs();
 send('asioList');
 return {
   toggle,amplitude,spectrum,setDetailedAnalysis,recordingStream:()=>stream,
   captureClipMic:token=>send('asioClipMic',{token}),folder:media=>send('folder',{media}),midi:()=>send('midi'),
   refreshInputs:listInputs,
   asioDrivers:names=>{asioDevices=names;listInputs();},
   asioOpened:(channels,error,stereo)=>{const reply=asioReply;asioReply=null;if(reply)reply({channels,error,stereo});},
   asioLevels:(values,bands)=>{
     asioValues=values;signal.value=amplitude();
     asioBands=bands?{input:bands[0],bass:bands[1],mid:bands[2],high:bands[3],peak:bands[4]}:null;
   },
   asioRecovering:()=>{
     if(!asioDriver)return;
     clearAsioLevels();
     report('ASIO connection interrupted. Reconnecting…');
   },
   asioRecovered:(channels,error,stereo)=>{
     if(!asioDriver)return;
     installAsioChannels(asioDriver,channels,stereo);
     report('ASIO reconnected.');
   },
   asioStopped:error=>{asioDriver='';clearAsioLevels();channelField.hidden=true;micState('Mic off');report(error);},
   decodeVideoAudio,releaseVideoAudio,
   videoAudioDecoded:(id,url)=>{
     const settle=audioRequests.get(id);
     if(settle)settle(url);else releaseVideoAudio(url);
   },
   beginClip:format=>clip.Begin(format),writeClip:data=>clip.Write(data),
   discardClip:()=>clip.Discard(),finishClip:()=>send('finishClip'),
   shareClip:()=>send('shareClip'),full:value=>send('full',{value}),
   save:(name,data)=>send('save',{name,data}),
   googleSearch:(id,query,offset)=>send('googleSearch',{id,query,offset}),
   browseGoogle:query=>send('browseGoogle',{query})
 };
})();
window.addEventListener('keydown',event=>{
 const full=document.getElementById('stageWrap')?.classList.contains('expanded');
 if(event.key==='F11'){
   event.preventDefault();
   if(event.repeat)return;
   if(isDisplayOpen())toggleDisplayFullscreen();else setStageFull(!full);
 }
});

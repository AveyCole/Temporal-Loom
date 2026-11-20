// Android uses one Web Audio mic stream for both analysis and clip capture.
const micInput=window.chrome?.webview?Mic:(()=>{
 let stream,context,meter,samples,readBands,opening=false,native=false,waitingNative=false,revision=0;
 function stop(){
   revision++;opening=false;
   if(native||waitingNative)Mic.stopNativeMic();
   native=waitingNative=false;
   if(stream)for(const track of stream.getTracks())track.stop();
   if(context)context.close().catch(()=>{});
   stream=context=meter=samples=readBands=null;
   micState('Mic off');
 }
 async function toggle(){
   if(stream||native){stop();return;}
   if(opening||waitingNative)return;
   const request=++revision;opening=true;
   try{
     const next=await navigator.mediaDevices.getUserMedia({audio:{echoCancellation:false,noiseSuppression:false,autoGainControl:false},video:false});
     if(request!==revision){next.getTracks().forEach(track=>track.stop());return;}
     stream=next;context=new AudioContext();
     meter=context.createAnalyser();meter.fftSize=2048;meter.smoothingTimeConstant=.16;
     samples=new Float32Array(meter.fftSize);readBands=makeSpectrumReader();
     context.createMediaStreamSource(stream).connect(meter);
     await context.resume();
     if(request!==revision)return;
     next.getAudioTracks()[0].addEventListener('ended',()=>{if(stream===next)stop();},{once:true});
     micState('Mic on');
   }catch(error){
     if(request!==revision)return;
     if(error.name!=='NotAllowedError'&&typeof Mic.startNativeMic==='function'){
       stop();waitingNative=true;Mic.startNativeMic();return;
     }
     stop();report(error.name==='NotAllowedError'?'Microphone permission was denied.':'Could not open the microphone.');
   }finally{if(request===revision)opening=false;}
 }
 addEventListener('pagehide',()=>{if(stream)stop();});
 return {toggle,stop,active:()=>Boolean(stream)||native,recordingStream:()=>stream,
   nativeState(active){
     if(!waitingNative&&!native)return;
     waitingNative=false;native=active;
     micState(active?'Mic on':'Mic off');
     if(!active)report('Could not open the microphone.');
   },
   amplitude(){
     if(native)return Mic.nativeAmplitude();
     if(!meter)return 0;
     meter.getFloatTimeDomainData(samples);
     let square=0;for(const sample of samples)square+=sample*sample;
     return Math.min(1,Math.sqrt(square/samples.length)*9.36);
   },spectrum:()=>meter?readBands(meter,context.sampleRate):null};
})();

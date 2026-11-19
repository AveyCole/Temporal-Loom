const Mic=(()=>{
 let stream,context,meter,samples,clipFormat='webm';
 const send=(action,data={})=>window.loom.send(action,data);
 return {
 async toggle(){if(stream){stream.getTracks().forEach(t=>t.stop());context.close();stream=null;meter=null;micState('Mic off');return;}try{stream=await navigator.mediaDevices.getUserMedia({audio:{echoCancellation:false,noiseSuppression:false,autoGainControl:false}});context=new AudioContext();await context.resume();meter=context.createAnalyser();meter.fftSize=1024;context.createMediaStreamSource(stream).connect(meter);samples=new Float32Array(1024);micState('Mic on');}catch(e){report('Microphone: '+e.message);}},
 amplitude(){if(!meter)return 0;meter.getFloatTimeDomainData(samples);return Math.min(1,Math.sqrt(samples.reduce((s,x)=>s+x*x,0)/samples.length)*9.36);},
 folder:media=>send('folder',{media}),
 async midi(){try{const access=await navigator.requestMIDIAccess();for(const input of access.inputs.values())input.onmidimessage=e=>nativeNote(...e.data);if(access.inputs.size)nativeMidiReady();else report('No MIDI input found. Connect a controller and try again.');}catch(e){report('MIDI: '+e.message);}},
 save:(name,data)=>send('save',{name,data}),full:value=>send('full',{value}),
 beginClip(format){clipFormat=format;return window.loom.call('beginClip',{format});},writeClip:data=>window.loom.call('writeClip',{data}),discardClip:()=>send('discardClip'),finishClip:()=>send('finishClip',{format:clipFormat}),shareClip:()=>send('shareClip'),
 googleSearch:(id,query,offset)=>{googleResult(id,[],'Google Images search is unavailable in this Mac build. Choose Wikipedia or Internet Archive, or open Google Images and import downloaded media.');},browseGoogle:query=>send('browseGoogle',{query})
 };
})();

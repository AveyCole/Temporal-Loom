const Mic=(()=>{
 const send=(action,data={})=>window.loom.send(action,data);
 const picker=document.getElementById('micDevice'),channels=document.getElementById('micChannel');
 const field=document.getElementById('micChannelField'),signal=document.getElementById('micSignal');
 let stream,context,meter,samples,splitter,micSource,pending=false,selected=localStorage.getItem('macMicInput')||'',clipFormat='webm';
 let midiAccess=null;
 async function listInputs(){
  try{const devices=await navigator.mediaDevices.enumerateDevices();picker.replaceChildren(new Option('System default',''));
   for(const [index,device] of devices.filter(d=>d.kind==='audioinput'&&!['default','communications'].includes(d.deviceId)).entries())picker.add(new Option(device.label||'Microphone '+(index+1),device.deviceId));
   if(selected&&!Array.from(picker.options).some(o=>o.value===selected))picker.add(new Option('Saved microphone',selected));picker.value=selected;
  }catch{}
 }
 function stop(){stream?.getTracks().forEach(t=>t.stop());context?.close().catch(()=>{});stream=context=meter=samples=splitter=micSource=null;field.hidden=true;signal.value=0;}
 function connectChannel(){if(!context||!splitter)return;splitter.disconnect();micSource.disconnect();micSource.connect(splitter);const choice=channels.value;
  if(choice==='mix')micSource.connect(meter);
  else splitter.connect(meter,Number(choice));
  localStorage.setItem('macMicChannel:'+selected,choice);
 }
 async function open(id){
  if(pending)return false;pending=true;picker.disabled=true;let next,ctx;
  try{const audio={autoGainControl:false,echoCancellation:false,noiseSuppression:false,channelCount:{ideal:32}};if(id)audio.deviceId={exact:id};
   next=await navigator.mediaDevices.getUserMedia({audio});ctx=new AudioContext();await ctx.resume();stop();stream=next;context=ctx;
   meter=context.createAnalyser();meter.fftSize=1024;samples=new Float32Array(meter.fftSize);
   const count=Math.max(1,Math.min(32,stream.getAudioTracks()[0].getSettings().channelCount||1));
   splitter=context.createChannelSplitter(count);micSource=context.createMediaStreamSource(stream);micSource.connect(splitter);
   channels.replaceChildren(new Option('All channels','mix'));for(let n=0;n<count;n++)channels.add(new Option('Input '+(n+1),String(n)));
   const saved=localStorage.getItem('macMicChannel:'+id)||'mix';channels.value=Array.from(channels.options).some(o=>o.value===saved)?saved:'mix';
   selected=id;connectChannel();field.hidden=count<2;stream.getAudioTracks()[0].onended=()=>{stop();micState('Mic off');};micState('Mic on');return true;
  }catch(e){next?.getTracks().forEach(t=>t.stop());ctx?.close().catch(()=>{});report('Microphone unavailable: '+e.message);if(!stream)micState('Mic off');return false;}
  finally{pending=false;picker.disabled=false;listInputs();}
 }
 picker.onchange=async()=>{const next=picker.value;if(stream&&!await open(next)){picker.value=selected;return;}selected=next;localStorage.setItem('macMicInput',selected);};
 channels.onchange=connectChannel;navigator.mediaDevices?.addEventListener('devicechange',listInputs);listInputs();addEventListener('pagehide',stop);
 const midiPicker=document.getElementById('midiDevices');
 function bindMidi(){const inputs=Array.from(midiAccess.inputs.values()).filter(p=>p.state==='connected');const previous=midiPicker.value;
  midiPicker.replaceChildren(...inputs.map(p=>new Option(p.name||'MIDI input',p.id)));midiPicker.hidden=!inputs.length;
  if(inputs.some(p=>p.id===previous))midiPicker.value=previous;
  for(const port of midiAccess.inputs.values())port.onmidimessage=port.id===midiPicker.value?e=>midiMessage(port,e):null;
  if(inputs.length){$('driver').value='midi';$('driver').onchange();report('MIDI connected. Notes select fragments, CC1 blends and CC74 warps.');}else report('No MIDI input found. Connect a controller.');
 }
 midiPicker.addEventListener('change',()=>{midiHeld.clear();bindMidi();});
 return {
 async toggle(){if(pending)return;if(stream){stop();micState('Mic off');}else await open(selected);},
 amplitude(){if(!meter)return 0;meter.getFloatTimeDomainData(samples);const level=Math.min(1,Math.sqrt(samples.reduce((s,x)=>s+x*x,0)/samples.length)*9.36);signal.value=level;return level;},
 refreshInputs:listInputs,folder:media=>send('folder',{media}),
 async midi(){try{if(!midiAccess){midiAccess=await navigator.requestMIDIAccess();midiAccess.onstatechange=bindMidi;}bindMidi();}catch(e){report('MIDI: '+e.message);}},
 save:(name,data)=>send('save',{name,data}),full:value=>send('full',{value}),
 beginClip(format){clipFormat=format;return window.loom.call('beginClip',{format});},writeClip:data=>window.loom.call('writeClip',{data}),discardClip:()=>send('discardClip'),finishClip:()=>send('finishClip',{format:clipFormat}),shareClip:()=>send('shareClip'),
 googleSearch:(id,query,offset)=>send('googleSearch',{id,query,offset}),browseGoogle:query=>send('browseGoogle',{query}),
 decodeVideoAudio:asset=>window.loom.decodeVideoAudio(asset.file||asset.image),releaseVideoAudio:url=>send('releaseVideoAudio',{url})
 };
})();
window.addEventListener('keydown',event=>{if(event.key!=='F11')return;event.preventDefault();if(event.repeat)return;if(isDisplayOpen())toggleDisplayFullscreen();else setStageFull(!$('stageWrap').classList.contains('expanded'));});

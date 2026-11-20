const audioResponseControl=$('audioResponse');
let audioResponse='standard';

function setAudioResponse(value){
 audioResponse=value==='maximum'?'maximum':'standard';
 audioResponseControl.value=audioResponse;
 localStorage.setItem('audioResponse',audioResponse);
 if(analyser)configureFileResponseMeter();
 Mic.setDetailedAnalysis?.(audioResponse==='maximum');
}
function configureFileResponseMeter(){
 const maximum=audioResponse==='maximum';
 analyser.fftSize=maximum?2048:1024;
 analyser.smoothingTimeConstant=maximum ? .16 : .45;
 freq=new Uint8Array(analyser.frequencyBinCount);
}
audioResponseControl.onchange=()=>setAudioResponse(audioResponseControl.value);
setAudioResponse(localStorage.getItem('audioResponse'));

const limitResponse=value=>Math.max(0,Math.min(1,value));
function makeSpectrumReader(){
 let audioSource,values,previous,samples,gain;
 return (meter,rate)=>{
   if(audioSource!==meter||values?.length!==meter.frequencyBinCount){
     audioSource=meter;
     values=new Uint8Array(meter.frequencyBinCount);previous=new Float32Array(values.length);
     samples=new Float32Array(meter.fftSize);
     gain=Float32Array.from({length:256},(_,i)=>{
       const db=meter.minDecibels+(meter.maxDecibels-meter.minDecibels)*i/255;
       return i?Math.pow(10,(db+30)/20):0;
     });
   }
   meter.getByteFrequencyData(values);meter.getFloatTimeDomainData(samples);
   let square=0,peak=0,bass=0,mid=0,high=0,rise=0,active=0;
   for(const sample of samples){square+=sample*sample;peak=Math.max(peak,Math.abs(sample));}
   const binHz=rate/meter.fftSize;
   for(let i=1;i<values.length&&i*binHz<12000;i++){
     const hz=i*binHz,power=gain[values[i]],delta=Math.max(0,power-previous[i]);
     if(hz<230)bass+=power*power;
     else if(hz<2200)mid+=power*power;
     else high+=power*power;
     rise+=delta*delta;active+=power*power;
     previous[i]=power;
   }
   return {input:Math.sqrt(square/samples.length)*6,peak:limitResponse(peak*2.8),
     bass:Math.sqrt(bass)*.63,mid:Math.sqrt(mid)*.56,
     high:Math.sqrt(high)*.52,flux:limitResponse(Math.sqrt(rise)/(1+Math.sqrt(active)))};
 };
}

function makeMaximumMotion(){
 const bands=['bass','mid','high'];
 const envelopes=new Float64Array(bands.length),reference=new Float64Array(bands.length),previous=new Float64Array(bands.length);
 let source='',level=0,mean=0,peak=0,pulse=0,cooldown=0;
 return (driver,signal,sensitivity,dt)=>{
   if(driver!==source){
     source=driver;envelopes.fill(0);reference.fill(.1);previous.fill(0);level=mean=peak=pulse=cooldown=0;
   }
   const amount=.75+2.65*sensitivity;
   const curve=value=>1-Math.exp(-Math.max(0,value-.009)*amount);
   const input=curve(signal.input||0);
   const smooth=(current,target,rise,fall)=>current+(target-current)*(1-Math.exp(-dt/(target>current?rise:fall)));
   const normalizedBand=(key,index,fallback)=>{
     const raw=curve(signal[key]??fallback);
     const jump=Math.max(0,raw-previous[index]);previous[index]=raw;
     envelopes[index]=smooth(envelopes[index],raw,.028,.14);
     reference[index]=Math.max(.10,raw,smooth(reference[index],raw,.08,2.4));
     return [limitResponse(.49*envelopes[index]+.51*envelopes[index]/reference[index]),jump];
   };
   const [bass,kick]=normalizedBand('bass',0,input*.74);
   const [mid,body]=normalizedBand('mid',1,input*.6);
   const [high,snap]=normalizedBand('high',2,input*.39);
   level=smooth(level,input,.026,.22);
   mean=smooth(mean,input,.75,.95);
   const crest=limitResponse(signal.peak??input);
   const edge=Math.max(0,input-peak);
   peak=smooth(peak,input,.065,.29);
   cooldown=Math.max(0,cooldown-dt);
   const transient=limitResponse(kick*1.3+body*.72+snap*1.05+(signal.flux||0)*1.2+edge*.85);
   const impulse=input>.027&&transient>.165+mean*.12;
   const onset=impulse&&cooldown===0;
   pulse=Math.max(pulse*Math.exp(-dt/.17),impulse?Math.min(1,transient*(.8+.8*crest)):0);
   if(onset)cooldown=.16;
   return {level,pulse,speed:Math.min(5.6,level*1.7+bass*2.65+mid*.63+pulse*2.5),
     grainSpeed:Math.min(9,level*.8+mid*1.35+high*5.9+pulse*3.1),fxSpeed:Math.min(7,level*.8+bass*1.3+mid*2.8+high*1.8+pulse*3.2),
     dynamic:{bass,mid,high,onset}};
 };
}

const maximumMotion=makeMaximumMotion(),fileSpectrum=makeSpectrumReader();
let lastNativeSpectrum,parsedNativeSpectrum,maximumSource='';
function readMaximumMotion(driver,dt,sensitivity,file){
 let spectrum;
 if(driver==='mic'){
   const features=Mic.spectrum?.();
   if(typeof features==='string'){
     if(features!==lastNativeSpectrum){
       lastNativeSpectrum=features;parsedNativeSpectrum=null;
       try{const [input,bass,mid,high,peak]=JSON.parse(features);parsedNativeSpectrum={input,bass,mid,high,peak};}catch{}
     }
     spectrum=parsedNativeSpectrum;
   }else spectrum=features;
   spectrum??={input:Mic.amplitude()};
 }else if(file)spectrum=fileSpectrum(analyser,audioContext.sampleRate);
 const source=driver+':'+(file?'playing':driver==='mic'?'live':'paused');
 return maximumMotion(source,spectrum||{input:0,bass:0,mid:0,high:0},sensitivity,dt);
}

const audioSurface=document.createElement('canvas');
const audioPaint=audioSurface.getContext('2d');
function drawMaximumResponse(ctx,motion,time){
 const bands=motion.dynamic;
 if(!bands)return;
 const {bass,mid,high}=bands,pulse=motion.pulse;
 if(bass+mid+high+pulse<.055)return;
 const w=ctx.canvas.width,h=ctx.canvas.height;
 const scale=Math.min(1,(clipResolution?1600:960)/Math.max(w,h));
 const sw=Math.max(1,Math.round(w*scale)),sh=Math.max(1,Math.round(h*scale));
 if(audioSurface.width!==sw||audioSurface.height!==sh){audioSurface.width=sw;audioSurface.height=sh;}
 audioPaint.clearRect(0,0,sw,sh);audioPaint.drawImage(ctx.canvas,0,0,sw,sh);
 const zoom=1+.13*bass+.09*pulse;
 ctx.save();
 ctx.translate(w/2,h/2);ctx.rotate(.035*mid*Math.sin(time*.92));ctx.scale(zoom,zoom);ctx.translate(-w/2,-h/2);
 ctx.drawImage(audioSurface,0,0,w,h);
 const ribbons=7+Math.floor(high*7);
 for(let i=0;i<ribbons;i++){
   const y=i*h/ribbons,dy=h/ribbons+1;
   const dx=w*(.015*mid+.065*pulse)*Math.sin(i*.72+time*.95);
   ctx.save();ctx.beginPath();ctx.rect(0,y,w,dy);ctx.clip();ctx.globalAlpha=.26+.33*pulse;
   ctx.drawImage(audioSurface,dx,0,w,h);ctx.restore();
 }
 if(high>.07){
   ctx.globalCompositeOperation='screen';ctx.globalAlpha=high*.15;
   ctx.drawImage(audioSurface,(.018+mid*.019)*w*Math.sin(time*1.23),-h*.011, w,h);
 }
 ctx.restore();
}

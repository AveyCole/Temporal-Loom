function makeAudioMotion(){
 let level=0,average=0,previous=0,pulse=0,cooldown=0,source='';
 return function update(driver,input,sensitivity,dt){
   if(driver!==source){level=average=previous=pulse=cooldown=0;source=driver;}
   if(driver!=='audio'&&driver!=='mic')return {speed:1,level:0,pulse:0};
   const value=Math.max(0,Math.min(1,(input-.012)*(.6+2.4*sensitivity)));
   level+=(value-level)*(1-Math.exp(-dt/(value>level?.045:.19)));
   average+=(level-average)*(1-Math.exp(-dt/.85));
   cooldown-=dt;pulse*=Math.exp(-dt/.16);
   if(value-previous>.035 && value>average*1.25+.045 && cooldown<=0){
     pulse=Math.min(1,(value-average)*2.8);cooldown=.16;
   }
   previous=value;
   return {level,pulse,speed:level*2.8+pulse*2.1};
 };
}
const updateAudioMotion=makeAudioMotion();
let oldBins=null,fluxMean=.012,attack=0;
function readDriver(driver,dt){
 const file=driver==='audio' && analyser && !$('audio').paused;
 let input=0,low=0,high=0;
 if(driver==='mic')input=Mic.amplitude();
 if(file){
   analyser.getByteFrequencyData(freq);
   if(!oldBins||oldBins.length!==freq.length)oldBins=new Uint8Array(freq.length);
   let total=0,flux=0,lowN=0,hiN=0;
   for(let i=1;i<freq.length;i++){
     const hz=i*audioContext.sampleRate/analyser.fftSize,v=freq[i]/255;
     total+=v*v;flux+=Math.max(0,freq[i]-oldBins[i])/255;
     if(hz<240){low+=v*v;lowN++;}
     if(hz>=1800&&hz<11000){high+=v*v;hiN++;}
   }
   oldBins.set(freq);low=Math.sqrt(low/Math.max(1,lowN));high=Math.sqrt(high/Math.max(1,hiN));
   flux/=freq.length;fluxMean+=(flux-fluxMean)*(1-Math.exp(-dt/.9));
   attack=Math.max(attack*Math.exp(-dt/.14),Math.min(1,Math.max(0,flux-fluxMean*.95)*18));
   input=Math.min(1,Math.sqrt(total/freq.length)*1.55+.25*low);
 }else{oldBins=null;attack=0;fluxMean=.012;}
 const motion=updateAudioMotion(driver,input,Number($('sensitivity').value),dt);
 if(file){
   const gain=.4+1.6*Number($('sensitivity').value);
   motion.speed+=gain*(low*.72+attack*1.5);
   motion.grainSpeed=motion.speed*.55+gain*(high*2.5+attack*4);
   motion.fxSpeed=motion.speed*.6+gain*(high*1.5+attack);
   motion.pulse=Math.max(motion.pulse,attack);
 }
 return motion;
}

const tempoDefaults={enabled:false,bpm:120,division:'1/4'};
const tempoToggle=$('tempoSync'),tempoBpm=$('tempoBpm'),tempoDivision=$('tempoDivision'),tempoCustom=$('tempoCustom');
let tempoSettings,tempoPeriod;
const tempoClock=makeTempoClock();

function makeTempoClock(){
 let anchor=null,pausedAt=null,emitted=0;
 return {
   reset(){anchor=pausedAt=null;emitted=0;},
   pause(now){if(anchor!==null&&pausedAt===null)pausedAt=now;},
   advance(now,period){
     if(anchor===null)anchor=now;
     if(pausedAt!==null){anchor+=now-pausedAt;pausedAt=null;}
     const time=Math.max(0,now-anchor)/period;
     const step=Math.floor(time+1e-9),steps=Math.max(0,step-emitted);
     emitted=step;
     return {steps,phase:Math.max(0,time-step)};
   }
 };
}

function tempoFraction(value){
 const match=/^([1-9]\d{0,2})\s*\/\s*([1-9]\d{0,2})$/.exec(String(value).trim());
 if(!match)return null;
 const numerator=Number(match[1]),denominator=Number(match[2]);
 if(numerator>128||denominator>128)return null;
 return {value:numerator+'/'+denominator,beats:4*numerator/denominator};
}

function restoreTempo(state){
 const fraction=tempoFraction(state?.division)||tempoFraction(tempoDefaults.division);
 const bpm=Math.min(400,Math.max(20,Math.round(Number(state?.bpm)||tempoDefaults.bpm)));
 tempoSettings={enabled:state?.enabled===true,bpm,division:fraction.value};
 tempoPeriod=60000/bpm*fraction.beats;
 tempoToggle.checked=tempoSettings.enabled;
 tempoBpm.value=bpm;
 tempoCustom.setCustomValidity('');
 tempoDivision.value=Array.from(tempoDivision.options).some(option=>option.value===fraction.value)?fraction.value:'custom';
 if(tempoDivision.value==='custom')tempoCustom.value=fraction.value;
 $('tempoCustomField').hidden=tempoDivision.value!=='custom';
 $('tempoSummary').textContent=tempoSettings.enabled?'Tempo · '+bpm+' BPM · '+fraction.value:'Tempo sync';
 localStorage.setItem('tempoSettings',JSON.stringify(tempoSettings));
 tempoClock.reset();
}

function initTempo(){
 let saved;
 try{saved=JSON.parse(localStorage.getItem('tempoSettings'));}catch{}
 restoreTempo(saved);
 const change=event=>{
   if(event.currentTarget===tempoToggle&&!tempoToggle.checked){restoreTempo({...tempoSettings,enabled:false});return;}
   const custom=tempoDivision.value==='custom';
   $('tempoCustomField').hidden=!custom;
   const division=custom?tempoCustom.value:tempoDivision.value;
   if(!tempoFraction(division)){
     tempoCustom.setCustomValidity('Enter a fraction with values from 1 to 128.');
     tempoCustom.reportValidity();
     return;
   }
   tempoCustom.setCustomValidity('');
   if(tempoToggle.checked&&!tempoSettings.enabled)manual=false;
   restoreTempo({enabled:tempoToggle.checked,bpm:tempoBpm.value,division});
 };
 for(const control of [tempoToggle,tempoBpm,tempoDivision,tempoCustom])control.onchange=change;
}

function updateFragmentTempo(now){
 if(!tempoSettings.enabled)return false;
 if(frozen){tempoClock.pause(now);return true;}
 const {steps,phase}=tempoClock.advance(now,tempoPeriod);
 if(steps){
   const count=assets.length||demos.length;
   a=(b+steps-1)%count;
   b=(a+1)%count;
   manual=false;
 }
 if(!manual)morph=phase;
 return true;
}

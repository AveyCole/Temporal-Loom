function installRack(host){
 const state={}, controls={}, defaults={};
 const details=document.createElement('details');
 const summary=document.createElement('summary');
 summary.textContent='Effects & fragment sampler';
 details.append(summary);host.append(details);
 function section(title){const h=document.createElement('h3');h.textContent=title;details.append(h);}
 function slider(key,title,min,max,step,initial,unit=''){
   const label=document.createElement('label'),output=document.createElement('output'),input=document.createElement('input');
   input.type='range';Object.assign(input,{min,max,step,value:initial});
   label.append(title+' ',output,input);details.append(label);
   controls[key]=v=>{input.value=v;state[key]=Number(input.value);output.textContent=state[key]+unit;};
   input.oninput=()=>controls[key](input.value);defaults[key]=initial;controls[key](initial);
 }
 function select(key,title,options){
   const label=document.createElement('label'),input=document.createElement('select');label.append(title,input);
   for(const name of options)input.add(new Option(name,name));details.append(label);
   controls[key]=v=>{input.value=options.includes(v)?v:options[0];state[key]=input.value;};
   input.onchange=()=>controls[key](input.value);defaults[key]=options[0];controls[key](options[0]);
 }
 section('Transport');
 slider('morphRate','Transition speed',0,4,.05,1,'×');
 slider('fxRate','Effect motion',0,4,.05,1,'×');
 section('Psychedelia');
 select('psy','Color treatment',rackOptions.psy);
 slider('color','Color depth',0,100,1,70,'%');
 slider('bands','Color bands',2,20,1,7);
 slider('trail','Feedback trail',0,90,1,0,'%');
 select('feedback','Trail shape',rackOptions.feedback);
 section('Early 2000s');
 select('era','Signal treatment',rackOptions.era);
 slider('damage','Signal damage',0,100,1,65,'%');
 slider('pitch','Pixel size',1,16,1,4,' px');
 section('Fragment grains');
 select('layout','Arrangement',rackOptions.layout);
 slider('size','Sample size',2,80,1,23,'%');
 slider('count','Grain count',1,64,1,20);
 slider('opacity','Grain mix',0,100,1,85,'%');
 slider('grainRate','Rearrangements per second',0,12,.25,1,' Hz');
 slider('drift','Grain drift',0,100,1,50,'%');
 let seed=1,beat=0,time=0,historyValid=false;
 const reseed=document.createElement('button');reseed.textContent='Reseed arrangement';reseed.onclick=()=>{seed++;beat=0;};details.append(reseed);
 section('Space');
 select('spatial','Frame effect',rackOptions.spatial);
 slider('spaceMix','Space mix',0,100,1,70,'%');
 slider('spaceScale','Space scale',0,100,1,55,'%');
 const space=createSpatialFX();
 function noise(id){let n=Math.imul(id^seed,0x45d9f3b);n=Math.imul(n^(n>>>16),0x45d9f3b);return ((n^(n>>>16))>>>0)/4294967296;}
 function grains(ctx,images,w,h,profile){
   const n=profile.count,columns=Math.ceil(Math.sqrt(n*w/h)),rows=Math.ceil(n/columns);
   ctx.save();ctx.globalAlpha=profile.opacity/100;
   for(let i=0;i<n;i++){
     const k=i*11+1,img=images[Math.floor(noise(k)*images.length)],iw=img.naturalWidth||img.width,ih=img.naturalHeight||img.height;
     const sw=Math.max(1,iw*profile.size/100),sh=Math.max(1,ih*profile.size/100);
     let dw=w*profile.size/100,dh=h*profile.size/100,x=noise(k+1)*(w-dw),y=noise(k+2)*(h-dh);
     if(state.layout==='Tile shuffle'){dw=w/columns;dh=h/rows;x=(i%columns)*dw;y=Math.floor(i/columns)*dh;}
     if(state.layout==='Tape splices'){dw=w;dh=Math.max(1,h*profile.size/400);x=0;y=noise(k+2)*(h-dh);}
     const shape=grainShapes[state.layout];
     if(shape){
       ctx.save();
       [x,y,dw,dh]=shape(ctx,k,time,profile.drift/100,noise,w,h,dw,dh);
     }
     ctx.drawImage(img,noise(k+3)*(iw-sw),noise(k+4)*(ih-sh),sw,sh,x,y,dw+.5,dh+.5);
     if(shape)ctx.restore();
   }
   ctx.restore();
 }
 const buffer=document.createElement('canvas'),pixels=buffer.getContext('2d',{willReadFrequently:true});
 const history=document.createElement('canvas'),memory=history.getContext('2d');
 const lut=new Uint8ClampedArray(256*3);
 function colorize(v,depth,hue){
   for(let i=0;i<256;i++){
     const phase=i/255*state.bands+time*.35+hue;
     for(let c=0;c<3;c++){
       let tone=extraTone(state.psy,i,c,phase,time);
       if(state.psy==='Acid solarize')tone=Math.abs(((phase*255+c*73)%510)-255);
       if(state.psy==='Oil slick')tone=127+120*Math.sin(phase*.9+c*2.1+Math.sin(phase*.33));
       if(state.psy==='Thermal print')tone=255*Math.max(0,Math.min(1,1.5-Math.abs(i/85-[2.6,1.35,.35][c]+.25*Math.sin(time))));
       if(state.psy==='Violet chrome')tone=127+127*Math.cos(phase*.72+[0,2.7,.6][c]+Math.sin(time*.4));
       if(state.psy==='Palette cycling')tone=127+126*Math.sin(Math.floor(i*state.bands/256)*.85+time+c*2.094);
       lut[i*3+c]=tone;
     }
   }
   for(let j=0;j<v.length;j+=4){
     const r=v[j],g=v[j+1],b=v[j+2],lum=(r*3+g*6+b)/10|0;
     for(let c=0;c<3;c++)v[j+c]+=(channelColor(state.psy,r,g,b,c,lut[lum*3+c])-v[j+c])*depth;
   }
 }
 function process(ctx,images,delta,motion={speed:1,level:0,pulse:0}){
   const w=ctx.canvas.width,h=ctx.canvas.height;
   const {bass=0,mid=0,high=0,onset=false}=motion.dynamic||{};
   if(state.layout!=='Off'){
     beat+=delta*(motion.grainSpeed??motion.speed)*state.grainRate;if(beat>=1){seed+=Math.floor(beat);beat%=1;}
     if(state.grainRate&&onset)seed+=1+Math.floor(high*6);
     const profile=motion.dynamic?{
       count:Math.min(64,Math.max(1,Math.round(state.count*(1+high*.76+motion.pulse*.35)))),
       opacity:Math.min(100,state.opacity*(1+mid*.45+motion.pulse*.28)),
       size:Math.min(80,Math.max(2,state.size*(1+bass*.44-high*.48))),
       drift:Math.min(100,state.drift*(1+mid*.4+high*.38))
     }:state;
     grains(ctx,images,w,h,profile);
   }
   if(state.psy!=='Clean'||state.era!=='Clean'){
     const scale=Math.min(1,400/Math.max(w,h),state.era==='Clean'?1:1/(state.pitch*(1+high*.55)));
     const bw=Math.max(1,Math.round(w*scale)),bh=Math.max(1,Math.round(h*scale));
     if(buffer.width!==bw||buffer.height!==bh){buffer.width=bw;buffer.height=bh;}
     pixels.drawImage(ctx.canvas,0,0,bw,bh);
     const frame=pixels.getImageData(0,0,bw,bh),v=frame.data;
     if(state.psy!=='Clean')colorize(v,Math.min(1,state.color/100*(1+.65*mid+.4*bass)),mid*.72+(onset ? .08 : 0));
     const amount=Math.min(1,state.damage/100*(1+high*.75+(motion.dynamic?motion.pulse*.52:0)));
     if(newSignalModes.has(state.era)&&amount>0)extraSignal(state.era,v,bw,bh,amount,time,noise);
     else if(state.era!=='Clean'&&amount>0){
       const grainPhase=Math.floor(time*8),steps=Math.max(2,Math.round(64-60*amount));
       for(let y=0;y<bh;y++){
         const line=Math.floor(y/5),offset=state.era==='Damaged codec' && noise(line+grainPhase*31)<amount*.35?Math.floor(noise(line+grainPhase*17+3)*bw*.22):0;
         for(let x=0;x<bw;x++){
           const j=(y*bw+x)*4,src=(y*bw+Math.min(bw-1,x+offset))*4;
           for(let c=0;c<3;c++){
             if(state.era==='CRT phosphor')v[j+c]*=(y%2?.98:1-amount*.4)*(x%3===c?1:1-amount*.24);
             else if(state.era==='Dial-up webcam')v[j+c]=Math.round(v[j+c]/255*steps)*255/steps+(noise(x+y*bw+grainPhase)-.5)*amount*23;
             else v[j+c]=Math.round(v[src+c]/255*steps)*255/steps;
           }
         }
       }
     }
     pixels.putImageData(frame,0,0);ctx.save();ctx.imageSmoothingEnabled=state.era==='Clean';ctx.drawImage(buffer,0,0,w,h);ctx.restore();
   }
   space.process(ctx,state,time,motion);
   if(state.trail){
     if(history.width!==w||history.height!==h){history.width=w;history.height=h;historyValid=false;}
     if(historyValid){
       const retention=Math.min(.95,state.trail/100*(1+mid*.3+bass*.18));
       ctx.save();ctx.globalAlpha=Math.pow(retention,Math.max(.01,delta*30));ctx.translate(w/2,h/2);
       const rate=Math.min(motion.dynamic?5:3,motion.speed+bass*1.2),zoom=state.feedback==='Inward spiral'?1-.018*rate:1+.012*rate;
       if(state.feedback==='Mirror trail')ctx.scale(-1,1);
       if(state.feedback==='Vertical drift')ctx.translate(0,h*.022*rate*Math.sin(time*.9));
       ctx.rotate((state.feedback==='Inward spiral'?.021:.005)*Math.sin(time)*rate);
       ctx.drawImage(history,-w*zoom/2,-h*zoom/2,w*zoom,h*zoom);ctx.restore();
     }
     memory.drawImage(ctx.canvas,0,0);historyValid=true;
   }else historyValid=false;
 }
 return {state,process,clearHistory(){historyValid=false;space.clear();},advance(delta){time+=delta*state.fxRate;return time;},
 save(){return {...state,seed};},restore(values={}){values=values||{};for(const k of Object.keys(controls))controls[k](values[k]??defaults[k]);seed=Number.isSafeInteger(values.seed)?values.seed:1;beat=0;time=0;historyValid=false;space.clear();}};
}

const transitionStyles=['Iris rings','Venetian blinds','Pixel dissolve','Clock sweep','Film splice','Folded tiles','Zipper','Wave curtain','Spiral shutters'];
function drawTransition(style,img,alpha,layer,t){
 if(!transitionStyles.includes(style)&&style!=='Clean cut')return false;
 const w=canvas.width,h=canvas.height,iw=img.naturalWidth||img.width,ih=img.naturalHeight||img.height;
 const scale=Math.max(w/iw,h/ih),dw=iw*scale,dh=ih*scale,x=(w-dw)/2,y=(h-dh)/2;
 const draw=()=>ctx.drawImage(img,x,y,dw,dh);
 ctx.save();ctx.globalCompositeOperation='source-over';ctx.globalAlpha=1;
 if(!layer||alpha>=1){draw();ctx.restore();return true;}
 if(style==='Clean cut'){if(alpha>=.5)draw();ctx.restore();return true;}
 if(alpha<=0){ctx.restore();return true;}
 const warp=Number($('warp').value),r=Math.hypot(w,h)/2,p=alpha,turn=Math.PI*2;
 ctx.beginPath();
 if(style==='Iris rings'){
   for(let i=0;i<7;i++){const outer=r*(i+p)/7,inner=r*i/7;
     ctx.moveTo(w/2+outer,h/2);ctx.arc(w/2,h/2,outer,0,turn);if(inner){ctx.moveTo(w/2+inner,h/2);ctx.arc(w/2,h/2,inner,0,turn,true);}}
 }else if(style==='Clock sweep'||style==='Spiral shutters'){
   const count=style==='Clock sweep'?1:10;
   for(let i=0;i<count;i++){const angle=i*turn/count+t*.12*warp;ctx.moveTo(w/2,h/2);ctx.arc(w/2,h/2,r+1,angle,angle+p*turn/count);ctx.closePath();}
 }else if(style==='Film splice'){
   ctx.rect(0,0,w,h*p);ctx.clip();ctx.translate(0,-h*(1-p));draw();ctx.restore();return true;
 }else if(style==='Wave curtain'){
   ctx.moveTo(0,0);for(let i=0;i<=32;i++){const yy=i*h/32;ctx.lineTo(p*w+Math.sin(i*.31+t)*Math.sin(Math.PI*p)*w*.2*warp,yy);}ctx.lineTo(0,h);ctx.closePath();
 }else if(style==='Pixel dissolve'||style==='Folded tiles'){
   const n=12,m=Math.max(4,Math.round(n*h/w));
   for(let j=0;j<m;j++)for(let i=0;i<n;i++){
     const hash=Math.abs(Math.sin(i*127.1+j*311.7+1)*43758.5453)%1;
     if(style==='Pixel dissolve'){if(hash<p)ctx.rect(i*w/n,j*h/m,w/n+1,h/m+1);}
     else{const q=Math.max(0,Math.min(1,2*p-hash));ctx.rect((i+(1-q)/2)*w/n,j*h/m,q*w/n,h/m+1);}
   }
 }else for(let i=0;i<14;i++){
   if(style==='Zipper')ctx.rect(i%2?(1-p)*w:0,i*h/14,p*w,h/14+1);
   else ctx.rect(0,i*h/14,w,p*h/14);
 }
 ctx.clip();draw();ctx.restore();return true;
}
let defaultLook=localStorage.getItem('defaultLook')==='1';
function markDefault(value){defaultLook=value;localStorage.setItem('defaultLook',value?'1':'0');$('defaultFx').setAttribute('aria-pressed',String(value));}
function pick(options,last){const choices=options.filter(v=>v!==last);return choices[Math.floor(Math.random()*choices.length)];}
function scrambleInstrument(){
 const chooseMode=select=>{
   const options=Array.from(select.options,o=>o.value).filter(v=>v!=='Clean cut');
   select.value=pick(options,select.value);
   select.dispatchEvent(new Event('change',{bubbles:true}));
 };
 $('effect').value=pick(organicStyles,$('effect').value);
 organicSeed=Math.random()*4096;
 for(const mode of $('rack').querySelectorAll('select'))chooseMode(mode);

 // Sample the knob's actual steps, skipping its current position.
 for(const input of document.querySelectorAll('input[type=range]')){
   const min=Number(input.min),step=Number(input.step)||1;
   const steps=Math.round((Number(input.max)-min)/step);
   const current=Math.round((Number(input.value)-min)/step);
   let next=Math.floor(Math.random()*steps);
   if(next>=current)next++;
   input.value=String(min+next*step);
   if(input.id==='morph')morph=Number(input.value);
   else input.dispatchEvent(new Event('input',{bubbles:true}));
 }
 const state=rack.save();
 state.seed=(state.seed+1+Math.floor(Math.random()*999999))%1000001;
 rack.restore(state);
 markDefault(false);
 localStorage.setItem('lastFxLook',JSON.stringify({style:$('effect').value,...state}));
 updateOutputs();
 report('Scrambled · '+$('effect').value+' · '+state.psy+' · '+state.layout);
}
function applyLook(clean){
 const s=rack.save(),last=JSON.parse(localStorage.getItem('lastFxLook')||'{}');
 const int=(lo,hi)=>lo+Math.floor(Math.random()*(hi-lo+1));
 const style=clean?'Clean cut':pick(organicStyles,last.style);
 const look=clean?{psy:'Clean',era:'Clean',layout:'Off',spatial:'Off',feedback:'Flow',color:0,trail:0,damage:0,opacity:0,fxRate:0,grainRate:0,spaceMix:0}:
 {psy:pick(rackOptions.psy,last.psy),era:pick(rackOptions.era,last.era),layout:pick(rackOptions.layout,last.layout),
 spatial:Math.random()<.48?'Off':pick(rackOptions.spatial.slice(1),last.spatial),
 feedback:pick(rackOptions.feedback,last.feedback),spaceMix:int(16,46),spaceScale:int(19,80),drift:int(25,75),
 color:int(25,78),damage:int(15,65),bands:int(3,12),pitch:int(1,6),trail:int(0,48),grainRate:int(1,10)/4,
 fxRate:int(8,28)/20,size:int(8,38),count:int(5,28),opacity:int(20,62),seed:int(1,1000000)};
 rack.restore({...s,...look});$('effect').value=style;$('warp').value=clean?0:int(20,78)/100;updateOutputs();markDefault(clean);
 if(!clean)organicSeed=Math.random()*4096;
 if(!clean)localStorage.setItem('lastFxLook',JSON.stringify({style,...look}));
}
function initLooks(){
 const select=$('effect'),classic=document.createElement('optgroup'),organic=document.createElement('optgroup');
 classic.label='Classic';organic.label='Organic';
 for(const option of Array.from(select.options))classic.append(option);
 for(const name of [...transitionStyles,'Clean cut'])classic.append(new Option(name,name));
 for(const name of organicStyles)organic.append(new Option(name,name));
 select.append(organic,classic);
 $('mutateMorph').onclick=mutateMorph;
 $('scramble').onclick=scrambleInstrument;
 $('shuffleFx').onclick=()=>applyLook(false);$('defaultFx').onclick=()=>applyLook(true);
 applyLook(defaultLook);
}
function removeFragment(index){
 const removed=assets[index];if(!removed)return;
 const keepA=assets[a],keepB=assets[b],position=morph;
 assets.splice(index,1);showAssets();
 if(assets.length){a=Math.max(0,assets.indexOf(keepA));b=assets.indexOf(keepB);if(b<0||a===b)b=(a+1)%assets.length;morph=removed===keepA||removed===keepB?0:position;$('caption').textContent=assets[a].title;}
 else{$('fragmentCount').textContent='DEMO MODE';$('stageOrigin').textContent='SYNTHETIC DEMO';$('caption').textContent='No fragments in the deck.';}
 rack.clearHistory();report('Removed '+removed.title+' from the deck.');
}

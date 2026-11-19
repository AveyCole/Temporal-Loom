const rackOptions={
 psy:['Clean','Acid solarize','Oil slick','Palette cycling','Thermal print','Violet chrome','Cyanotype','Bleach bypass','False infrared','Lith print','Contour ink'],
 era:['Clean','Dial-up webcam','CRT phosphor','Damaged codec','RGB misregistration','Tape dropout','Bayer dither','Interlace drift','Packet smear'],
 layout:['Off','Scatter','Tile shuffle','Tape splices','Spore clouds','Orbiting shards','Contour weave','Slit scan','Specimen cells'],
 spatial:['Off','Mirror folds','Ribbon lens','Radial refraction','Frame ghosts','Time mosaic','Chromatic shadow'],
 feedback:['Flow','Inward spiral','Mirror trail','Vertical drift']
};
const fxClamp=(x,min=0,max=1)=>Math.max(min,Math.min(max,x));
const grainShapes={
 'Spore clouds'(ctx,k,time,drift,noise,w,h,dw,dh){
   const orbit=time*.3*drift+noise(k+3)*6.28;
   ctx.translate((.12+.76*noise(k+1))*w+Math.cos(orbit)*dw*drift,(.12+.76*noise(k+2))*h+Math.sin(orbit)*dh*drift);
   ctx.beginPath();ctx.ellipse(0,0,dw*.56,dh*.56,orbit,0,Math.PI*2);ctx.clip();return [-dw/2,-dh/2,dw,dh];
 },
 'Orbiting shards'(ctx,k,time,drift,noise,w,h,dw,dh){
   const angle=noise(k+1)*6.28+time*.4*drift*(noise(k+2)>.5?1:-1),radius=.7*noise(k+4)+.14;
   ctx.translate(w*(.5+.52*Math.cos(angle)*radius),h*(.5+.58*Math.sin(angle)*radius));
   ctx.rotate(angle+noise(k)*2.2);
   ctx.beginPath();ctx.moveTo(-dw*.5,-dh*.2);ctx.lineTo(dw*.25,-dh*.55);ctx.lineTo(dw*.55,dh*.4);ctx.lineTo(-dw*.28,dh*.48);ctx.closePath();ctx.clip();return [-dw*.56,-dh*.56,dw*1.12,dh*1.12];
 },
 'Contour weave'(ctx,k,time,drift,noise,w,h,dw,dh){
   const x=noise(k+1)*w,y=noise(k+2)*h;
   ctx.translate(x,y+Math.sin(x/w*12+time*.6)*h*.09*drift);
   ctx.rotate(Math.cos(x/w*12+time*.6)*.62*drift);
   return [-dw*.65,-dh*.12,dw*1.3,dh*.24];
 },
 'Slit scan'(ctx,k,time,drift,noise,w,h,dw){
   const stride=dw*.1+w*.006;
   const x=(noise(k+1)*w+time*20*drift)%w;
   return [x,0,stride,h];
 },
 'Specimen cells'(ctx,k,time,drift,noise,w,h,dw,dh){
   const x=noise(k+1)*w,y=noise(k+2)*h;
   ctx.translate(x+Math.cos(k+time*.4)*dw*.32*drift,y+Math.sin(k+time*.4)*dh*.32*drift);
   ctx.beginPath();
   for(let j=0;j<7;j++){
     const angle=j*Math.PI*2/7;
     const r=.38+noise(k+j)*.17;
     ctx.lineTo(Math.cos(angle)*dw*r,Math.sin(angle)*dh*r);
   }
   ctx.closePath();ctx.clip();return [-dw/2,-dh/2,dw,dh];
 }
};
function extraTone(mode,i,c,phase,time){
 const light=i/255;
 if(mode==='Cyanotype')return [5,21,46][c]*(1-light)+[221,244,239][c]*Math.pow(light,1.18);
 if(mode==='Lith print')return [11,4,9][c]+[241,194,154][c]*fxClamp((light-.13)*1.28)**1.7;
 if(mode==='Contour ink'){
   const ridge=Math.pow(.5+.5*Math.cos(phase*5.3),17);
   return [245,222,181][c]*(1-ridge)+[12,24,35][c]*ridge;
 }
 return i;
}
function channelColor(mode,r,g,b,c,tone){
 if(mode==='Bleach bypass'){
   const l=r*.30+g*.58+b*.12;
   const value=c===0?r:c===1?g:b;
   return fxClamp(128+((value-l)*.38+l-128)*1.62,0,255);
 }
 if(mode==='False infrared')return c===0?g*1.26+20:c===1?r*.68:b*.40+g*.41;
 return tone;
}
const newSignalModes=new Set(['RGB misregistration','Tape dropout','Bayer dither','Interlace drift','Packet smear']);
const ditherMatrix=[0,8,2,10,12,4,14,6,3,11,1,9,15,7,13,5];
function extraSignal(mode,v,w,h,amount,time,noise){
 const original=new Uint8ClampedArray(v);
 const phase=Math.floor(time*12),shift=Math.max(1,Math.round(w*.034*amount));
 const steps=Math.max(2,Math.round(14-10*amount));
 const sample=(x,y,c)=>original[(fxClamp(y,0,h-1)*w+fxClamp(x,0,w-1))*4+c];
 for(let y=0;y<h;y++){
   const dropout=noise(Math.floor(y/3)+phase*61)<.20*amount;
   const wave=Math.round(Math.sin(y*.32-time*6)*shift);
   for(let x=0;x<w;x++){
     const p=(y*w+x)*4;
     for(let c=0;c<3;c++){
       let out=v[p+c];
       if(mode==='RGB misregistration')out=sample(x+(c-1)*shift,y+c-1,c);
       if(mode==='Tape dropout')out=dropout?(noise(x+y*w+phase*73)>.66?235:sample(x+wave*2,y,c)*.27):sample(x+Math.round(wave*.15),y,c);
       if(mode==='Interlace drift')out=sample(x+(y%2?wave:0),y-(y%2),c)*(y%2?.82:1);
       if(mode==='Packet smear'){
         const z=noise(Math.floor(x/10)+Math.floor(y/8)*59+phase);
         if(z<amount*.54)out=sample(x-Math.floor(z*shift*9+shift),y-y%4,c);
       }
       if(mode==='Bayer dither')out=Math.round((out/255+(ditherMatrix[(y%4)*4+x%4]/16-.5)/steps)*steps)*255/steps;
       v[p+c]+=(out-v[p+c])*amount;
     }
   }
 }
}
function createSpatialFX(){
 const snapshot=document.createElement('canvas'),past=[];
 let lastTime=-Infinity,lastMode='';
 function copy(source,target,w,h){
   if(target.width!==w||target.height!==h){target.width=w;target.height=h;}
   const c=target.getContext('2d');
   c.clearRect(0,0,w,h);c.drawImage(source,0,0,w,h);
 }
 function clear(){past.length=0;lastTime=-Infinity;lastMode='';}
 function process(ctx,state,time,motion){
   const mode=state.spatial;
   if(mode!==lastMode){clear();lastMode=mode;}
   const mix=state.spaceMix/100;
   if(mode==='Off'||!mix)return;
   const w=ctx.canvas.width,h=ctx.canvas.height;
   if(!w||!h)return;
   const scale=Math.min(1,800/Math.max(w,h)),sw=Math.max(1,Math.round(w*scale)),sh=Math.max(1,Math.round(h*scale));
   if((snapshot.width!==sw||snapshot.height!==sh)&&past.length){past.length=0;lastTime=-Infinity;}
   copy(ctx.canvas,snapshot,sw,sh);
   const spread=state.spaceScale/100,movement=spread*(.5+.5*motion.level)+motion.pulse*.23;
   if(mode==='Frame ghosts'||mode==='Time mosaic'){
     if(!past.length||time-lastTime>=.13){
       const next=past.length>=6?past.pop():document.createElement('canvas');
       copy(snapshot,next,sw,sh);past.unshift(next);lastTime=time;
     }
   }
   ctx.save();ctx.globalAlpha=mix;
   if(mode==='Mirror folds'){
     const cols=2+Math.round(spread*5),width=w/cols;
     for(let i=0;i<cols;i++){
       ctx.save();ctx.beginPath();ctx.rect(i*width,0,width+.5,h);ctx.clip();
       ctx.translate((i+(i%2))*width,0);ctx.scale(i%2?-1:1,1);
       const drift=(.25+.25*Math.sin(time*.51))*sw;
       ctx.drawImage(snapshot,drift,0,sw*.48,sh,0,0,width+.5,h);ctx.restore();
     }
   }else if(mode==='Ribbon lens'){
     const slice=Math.ceil(h/48);
     for(let y=0;y<h;y+=slice){
       const d=Math.sin(time*.96+y/h*15)*w*.16*movement;
       ctx.save();ctx.beginPath();ctx.rect(0,y,w,slice+.5);ctx.clip();
       ctx.drawImage(snapshot,d-w*.16*movement,0,w*(1+.32*movement),h);ctx.restore();
     }
   }else if(mode==='Radial refraction'){
     const radius=Math.hypot(w,h),count=5+Math.round(spread*9);
     for(let i=0;i<count;i++){
       const angle=i*Math.PI*2/count;
       ctx.save();ctx.translate(w/2,h/2);ctx.beginPath();ctx.moveTo(0,0);ctx.arc(0,0,radius,angle,angle+Math.PI*2/count+.004);ctx.closePath();ctx.clip();
       ctx.rotate(Math.sin(i*3.7+time*.7)*movement*.36);
       ctx.drawImage(snapshot,-w*.63,-h*.63,w*1.26,h*1.26);ctx.restore();
     }
   }else if(mode==='Frame ghosts'){
     for(let i=past.length-1;i>=1;i--){
       const d=i*.034*movement;ctx.globalAlpha=mix/(1+i*.38);
       ctx.drawImage(past[i],-w*d+Math.sin(time+i)*w*d,h*d*.5,w*(1+d),h*(1+d));
     }
   }else if(mode==='Time mosaic'){
     const cols=3+Math.round(spread*7),rows=Math.max(2,Math.round(cols*h/w)),cw=w/cols,ch=h/rows;
     for(let y=0;y<rows;y++)for(let x=0;x<cols;x++){
       const frame=past[(x*3+y*5)%past.length];
       ctx.drawImage(frame,x*sw/cols,y*sh/rows,sw/cols,sh/rows,x*cw,y*ch,cw+.5,ch+.5);
     }
   }else if(mode==='Chromatic shadow'){
     ctx.globalCompositeOperation='difference';
     const dx=w*.10*movement,dy=h*.06*movement;
     ctx.drawImage(snapshot,dx*Math.cos(time),dy*Math.sin(time*.66),w,h);
     ctx.globalCompositeOperation='screen';ctx.globalAlpha=mix*.36;
     ctx.drawImage(snapshot,-dx,dy,w,h);
   }
   ctx.restore();
 }
 return {process,clear};
}

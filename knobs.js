function attachKnob(card,input,paint){
 let hold=null,active=false,startX=0,startY=0,base=0;
 const step=Number(input.step)||1;
 function set(v){
   const min=Number(input.min);
   input.value=String(min+Math.round((v-min)/step)*step);
   input.dispatchEvent(new Event('input',{bubbles:true}));
   input.dispatchEvent(new Event('change',{bubbles:true}));paint();
 }
 function end(){clearTimeout(hold);hold=null;active=false;card.classList.remove('adjusting');}
 function start(x,y){
   end();startX=x;startY=y;
   hold=setTimeout(()=>{base=Number(input.value);active=true;card.classList.add('adjusting');},320);
 }
 function move(x,y,e){
   if(!active){if(Math.hypot(x-startX,y-startY)>6)end();return;}
   if(e.cancelable)e.preventDefault();
   set(base+(startY-y)*(Number(input.max)-Number(input.min))/150);
 }
 card.addEventListener('touchstart',e=>{if(e.touches.length===1)start(e.touches[0].clientX,e.touches[0].clientY);else end();},{passive:true});
 card.addEventListener('touchmove',e=>{if(e.touches.length===1)move(e.touches[0].clientX,e.touches[0].clientY,e);else end();},{passive:false});
 card.addEventListener('touchend',end);card.addEventListener('touchcancel',end);
 card.oncontextmenu=e=>e.preventDefault();
 card.onpointerdown=e=>{if(e.pointerType==='mouse'&&e.button===0){card.setPointerCapture(e.pointerId);start(e.clientX,e.clientY);}};
 card.onpointermove=e=>{if(e.pointerType==='mouse'&&e.buttons===1)move(e.clientX,e.clientY,e);};
 card.onpointerup=e=>{if(e.pointerType==='mouse')end();};
 card.onkeydown=e=>{
   const direction={ArrowUp:1,ArrowRight:1,ArrowDown:-1,ArrowLeft:-1}[e.key];
   if(direction){e.preventDefault();set(Number(input.value)+direction*step);}
   if(e.key==='Home'||e.key==='End'){e.preventDefault();set(Number(e.key==='Home'?input.min:input.max));}
 };
}
function installKnobs(){
 const rackDetails=$('rack').querySelector('details');
 const tabs=document.createElement('div');tabs.className='rack-tabs';tabs.setAttribute('role','group');tabs.setAttribute('aria-label','Effect controls');
 rackDetails.querySelector('summary').after(tabs);
 let panel;const sections=[];
 for(const element of Array.from(rackDetails.children)){
   if(element.tagName==='H3'){
     panel=document.createElement('div');panel.className='knob-grid';
     const button=document.createElement('button');button.type='button';
     button.textContent=({'Transport':'Speed','Psychedelia':'Color','Early 2000s':'Signal','Fragment grains':'Grains'})[element.textContent]||element.textContent;
     element.replaceWith(panel);tabs.append(button);sections.push({panel,button});
     button.onclick=()=>sections.forEach(s=>{s.panel.hidden=s.button!==button;s.button.setAttribute('aria-pressed',String(s.button===button));});
   }else if(panel){panel.append(element);}
 }
 sections[0].button.click();
 function angle(el,input){el.style.setProperty('--angle',(-135+270*(Number(input.value)-Number(input.min))/(Number(input.max)-Number(input.min)))+'deg');}
 const knobs=[];
 for(const input of document.querySelectorAll('input[type=range]')){
   const label=input.closest('label')||input.labels[0];
   const caption=Array.from(label.childNodes).filter(n=>n.nodeType===3).map(n=>n.textContent.trim()).join(' ').trim();
   const card=document.createElement('button');card.type='button';card.className='knob-card';card.setAttribute('role','slider');card.setAttribute('aria-label',caption);card.setAttribute('aria-valuemin',input.min);card.setAttribute('aria-valuemax',input.max);card.title='Hold, then drag up or down';
   const face=document.createElement('span');face.className='small-dial';face.append(document.createElement('i'));
   const name=document.createElement('span');name.textContent=caption==='Rearrangements per second'?'Grain rate':caption;
   const value=document.createElement('b');card.append(face,name,value);
   const container=input.closest('.control-grid')?input.parentElement:label;
   container.before(card);container.hidden=true;
   const out=label.querySelector('output');let last='';
   const paint=()=>{const str=input.value+'|'+(out?.textContent||'');if(str===last)return;last=str;angle(face,input);value.textContent=out?.textContent||input.value;card.setAttribute('aria-valuenow',input.value);card.setAttribute('aria-valuetext',value.textContent);};
   const item={input,paint};knobs.push(item);paint();
   attachKnob(card,input,paint);
 }
 setInterval(()=>{if(!document.hidden)for(const k of knobs)k.paint();},120);
}
installKnobs();

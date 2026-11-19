const typeFontGroups={
 'Sans serif':['Atkinson Hyperlegible Next','Bricolage Grotesque','DM Sans','Geist','Inter','Lexend','Manrope','Montserrat',
   'Rethink Sans','Rubik','Space Grotesk','Work Sans'],
 'Serif':['Baskervville','Bodoni Moda','Cormorant Garamond','Crimson Pro','Fraunces','Gloock','Instrument Serif','Lora',
   'Old Standard TT','Playfair Display','Spectral','Young Serif'],
 'Poster & headline':['Anton','Archivo Black','Barlow Condensed','Bebas Neue','Climate Crisis','Dela Gothic One','Fascinate',
   'Oswald','Righteous','Unbounded'],
 'Pixel & arcade':['Micro 5','Pixelify Sans','Press Start 2P','Silkscreen','Sixtyfour','VT323'],
 'Tech & industrial':['Audiowide','Chakra Petch','Exo 2','Michroma','Orbitron','Oxanium','Wallpoet'],
 'Psychedelic & experimental':['Bungee Shade','Eater','Jacquarda Bastarda 9','Monoton','Nosifer','Rampart One','Rubik Burned',
   'Rubik Glitch','Rubik Wet Paint'],
 'Blackletter & historical':['Cinzel','Grenze Gotisch','MedievalSharp','Pirata One','UnifrakturCook','UnifrakturMaguntia'],
 'Monospace & typewriter':['Courier Prime','Cutive Mono','IBM Plex Mono','Inconsolata','JetBrains Mono','Martian Mono',
   'Roboto Mono','Space Mono','Xanh Mono'],
 'Handwriting & script':['Caveat','Comforter Brush','Dancing Script','Gloria Hallelujah','Kalam','Knewave','Pacifico','Sedgwick Ave Display'],
 'System':['System sans','System serif','System monospace']
};
const typeFamilies=new Set(Object.values(typeFontGroups).flat());
const typeOptions={
 lettering:['Solid','Outline','Offset print','Shadow'],
 texture:['Solid','Gradient','Paper grain','Halftone','Scanlines'],
 placement:['center','left','right','top','bottom'],
 weight:[300,400,600,700,900]
};
const typeDefaults={text:'',font:'Bricolage Grotesque',weight:400,lettering:'Solid',texture:'Solid',placement:'center',
 size:42,tracking:0,leading:100,angle:0,ink:'#d6fa82',paper:'#101817',accent:'#fe697c',caps:false,italic:false};
const typeFields=['font','weight','lettering','texture','placement','size','tracking','leading','angle','ink','paper','accent','caps','italic'];
const typeFonts=new Map();
const typeSegmenter=typeof Intl.Segmenter==='function'?new Intl.Segmenter(undefined,{granularity:'grapheme'}):null;
const typeGraphemes=text=>typeSegmenter?Array.from(typeSegmenter.segment(text),part=>part.segment):Array.from(text);
const fieldFor=name=>$('type'+name[0].toUpperCase()+name.slice(1));
let typeEditTarget=null,typePreviewRevision=0,typeEditBusy=false;
function normalizeType(style={}){
 const choice=(name,value)=>typeOptions[name].includes(value)?value:typeDefaults[name];
 const number=(name,low,high)=>Math.max(low,Math.min(high,style[name]!==''&&Number.isFinite(Number(style[name]))?Number(style[name]):typeDefaults[name]));
 const color=name=>/^#[0-9a-f]{6}$/i.test(style[name])?style[name]:typeDefaults[name];
 return {
   text:typeof style.text==='string'?style.text.trim().slice(0,1200):'',
   font:typeFamilies.has(style.font)||typeFonts.has(style.font)?style.font:typeDefaults.font,
   weight:choice('weight',Number(style.weight)),lettering:choice('lettering',style.lettering),
   texture:choice('texture',style.texture),placement:choice('placement',style.placement),
   size:number('size',4,95),tracking:number('tracking',-12,80),leading:number('leading',70,200),
   angle:number('angle',-180,180),ink:color('ink'),paper:color('paper'),accent:color('accent'),
   caps:style.caps===true,italic:style.italic===true
 };
}
function typeFontList(selected){
 const menu=$('typeFont');
 function group(label,options){
   const section=document.createElement('optgroup');section.label=label;section.append(...options);return section;
 }
 const groups=Object.entries(typeFontGroups).map(([label,fonts])=>group(label,fonts.map(font=>new Option(font,font))));
 if(typeFonts.size)groups.push(group('Imported',Array.from(typeFonts,([key,value])=>new Option(value.name,key))));
 menu.replaceChildren(...groups);
 menu.value=selected||typeDefaults.font;
}
function stepTypeFont(step){
 const menu=$('typeFont');
 menu.selectedIndex=(menu.selectedIndex+step+menu.length)%menu.length;
 previewType();
}
function canvasTypeface(spec){
 if(spec.font.startsWith('System '))return spec.font.slice(7)==='sans'?'sans-serif':spec.font.slice(7);
 return '"'+spec.font+'",sans-serif';
}
async function registerTypeFont(font){
 if(typeof font?.id!=='string'||!/^TypeFont-[0-9a-f]{24}$/.test(font.id)||typeof font?.data!=='string'||font.data.length>700000)throw Error('Unsupported font.');
 if(typeFonts.has(font.id))return font.id;
 if(typeFonts.size>=8)throw Error('This session can hold up to eight imported fonts.');
 const bytes=Uint8Array.from(atob(font.data),c=>c.charCodeAt(0));
 const face=new FontFace(font.id,bytes,{weight:'100 900'});
 await face.load();document.fonts.add(face);
 typeFonts.set(font.id,{id:font.id,name:String(font.name||'Custom font').slice(0,80),data:font.data});
 return font.id;
}
async function restoreTypeFonts(fonts){
 if(!Array.isArray(fonts))return;
 if(fonts.length>8)throw Error('Session includes too many imported fonts.');
 for(const font of fonts)await registerTypeFont(font);
 typeFontList($('typeFont').value);
}
function exportTypeFonts(){
 const fonts=new Set(assets.filter(item=>item.kind==='type').map(item=>item.typeSpec.font));
 return Array.from(fonts,font=>typeFonts.get(font)).filter(Boolean);
}
function validTypeReference(item){
 return item.kind==='type'&&item.source==='Typography'&&typeof item.typeSpec?.text==='string'&&
   !!item.typeSpec.text.trim()&&item.typeSpec.text.length<=1200;
}
function splitTypeText(spec,mode){
 const text=spec.caps?spec.text.toLocaleUpperCase():spec.text;
 if(!text)return [];
 const separator=mode==='words'?/\s+/:mode==='lines'?/\r?\n/:null;
 return (separator?text.split(separator):[text]).map(entry=>entry.trim()).filter(Boolean);
}
function wrapType(c,text,width,measure){
 const lines=[];
 for(const paragraph of text.split(/\r?\n/)){
   let line='';
   for(const word of paragraph.trim().split(/\s+/).filter(Boolean)){
     const joined=line?line+' '+word:word;
     if(measure(joined)<=width){line=joined;continue;}
     if(line){lines.push(line);line='';}
     if(measure(word)<=width){line=word;continue;}
     for(const letter of typeGraphemes(word)){
       if(line&&measure(line+letter)>width){lines.push(line);line='';}
       line+=letter;
     }
   }
   lines.push(line);
 }
 return lines;
}
function drawTypePaper(c,w,h,s){
 if(s.texture==='Gradient'){
   const gradient=c.createLinearGradient(0,h,w,0);
   gradient.addColorStop(0,s.paper);gradient.addColorStop(1,s.accent);c.fillStyle=gradient;
 }else c.fillStyle=s.paper;
 c.fillRect(0,0,w,h);
 c.save();c.fillStyle=s.accent;
 if(s.texture==='Scanlines'){
   c.globalAlpha=.23;for(let y=0;y<h;y+=Math.max(2,w/290))c.fillRect(0,y,w,w/760);
 }
 if(s.texture==='Halftone'){
   c.globalAlpha=.34;const step=w/62;
   for(let y=step/2;y<h;y+=step)for(let x=step/2;x<w;x+=step){
     c.beginPath();c.arc(x,y,step*(.12+.26*x/w),0,Math.PI*2);c.fill();
   }
 }
 if(s.texture==='Paper grain'){
   let state=0x573b2391;
   const roll=()=>{state^=state<<13;state^=state>>>17;state^=state<<5;return (state>>>0)/4294967296;};
   for(let i=0;i<7000;i++){
     c.globalAlpha=roll()*.28;const grain=w*(.0009+roll()*.004);c.fillRect(roll()*w,roll()*h,grain,grain*.54);
   }
 }
 c.restore();
}
async function paintType(target,s,text){
 const font=canvasTypeface(s);
 const style=(s.italic?'italic ':'')+s.weight+' ';
 await document.fonts.load(style+'72px '+font,text||'Aa').catch(()=>{});
 const c=target.getContext('2d'),w=target.width,h=target.height,scale=w/1280;
 c.save();c.clearRect(0,0,w,h);drawTypePaper(c,w,h,s);
 if(!text){c.restore();return;}
 const gap=s.tracking*scale;
 const nativeSpacing='letterSpacing' in c;
 if(nativeSpacing)c.letterSpacing=gap+'px';
 const measure=value=>c.measureText(value).width+(nativeSpacing?0:gap*Math.max(0,typeGraphemes(value).length-1));
 let size=s.size*h/100,lines=[],width,step;
 for(let i=0;i<54;i++){
   c.font=style+size+'px '+font;
   lines=wrapType(c,text,w*.84,measure);step=size*s.leading/100;
   width=Math.max(1,...lines.map(measure));
   const rows=step*(lines.length-1)+size;
   if(rows<=h*.78&&width<=w*.87)break;
   size*=.90;
 }
 const span=step*(lines.length-1);
 const y=s.placement==='top'?h*.13+size/2:s.placement==='bottom'?h*.87-size/2-span:h/2-span/2;
 const align=s.placement==='left'?.08:s.placement==='right'?.92:.5;
 c.translate(w/2,h/2);c.rotate(s.angle*Math.PI/180);c.translate(-w/2,-h/2);
 c.textBaseline='middle';c.lineJoin='round';c.lineWidth=Math.max(scale*2,size*.035);
 function write(value,x,y,outline=false){
   if(nativeSpacing||!gap){if(outline)c.strokeText(value,x,y);else c.fillText(value,x,y);return;}
   for(const ch of typeGraphemes(value)){
     if(outline)c.strokeText(ch,x,y);else c.fillText(ch,x,y);
     x+=c.measureText(ch).width+gap;
   }
 }
 lines.forEach((line,i)=>{
   const x=w*align-(s.placement==='left'?0:measure(line)*(s.placement==='right'?1:.5));
   const yy=y+i*step;
   if(s.lettering==='Offset print'||s.lettering==='Shadow'){
     c.fillStyle=s.accent;c.globalAlpha=s.lettering==='Shadow'?.7:.91;
     const shift=Math.max(3*scale,size*.085);write(line,x+shift,yy+shift*.72);c.globalAlpha=1;
   }
   c.fillStyle=s.ink;c.strokeStyle=s.ink;write(line,x,yy,s.lettering==='Outline');
 });
 c.restore();
}
async function makeTypeFragment(style){
 const spec=normalizeType(style);
 if(!spec.text)throw Error('Enter words before making a fragment.');
 const frame=document.createElement('canvas');frame.width=1280;frame.height=800;
 await paintType(frame,spec,spec.caps?spec.text.toLocaleUpperCase():spec.text);
 const preview=document.createElement('canvas');
 copyPreview(frame,preview,frame.width,frame.height);
 return {source:'Typography',date:'Custom type',kind:'type',title:spec.text.replace(/\s+/g,' ').slice(0,120),
   typeSpec:spec,img:preview,image:frame.toDataURL('image/webp',.9),poster:thumbnail(preview)};
}
function writeTypeFields(spec){
 $('typeWords').value=spec.text;typeFontList(spec.font);
 for(const name of typeFields){
   const control=fieldFor(name);
   if(control.type==='checkbox')control.checked=spec[name];else control.value=spec[name];
 }
}
function readTypeFields(){
 const draft={text:$('typeWords').value};
 for(const name of typeFields){
   const control=fieldFor(name);
   draft[name]=control.type==='checkbox'?control.checked:control.value;
 }
 return normalizeType(draft);
}
function previewType(){
 const version=++typePreviewRevision,spec=readTypeFields();
 const mode=typeEditTarget?'phrase':$('typeSplit').value,parts=splitTypeText(spec,mode);
 const live=$('typePreview');
 const preview=document.createElement('canvas');preview.width=live.width;preview.height=live.height;
 paintType(preview,spec,parts[0]||'Aa 0123').then(()=>{
   if(version!==typePreviewRevision)return;
   live.getContext('2d').drawImage(preview,0,0);
   $('addType').disabled=typeEditBusy||!parts.length;
   $('typeStatus').textContent=parts.length>1?parts.length+' fragments · showing the first':'';
 });
}
function toggleTypeTab(open){
 $('typePanel').hidden=!open;
 document.body.classList.toggle('type-open',open);
 $('typeTab').setAttribute('aria-pressed',String(open));
 $('studioTab').setAttribute('aria-pressed',String(!open&&!vf.active));
 $('vfTab').setAttribute('aria-pressed',String(!open&&vf.active));
 if(open){$('typePanel').scrollIntoView({block:'start'});previewType();}
}
function editTypeFragment(item){
 typeEditTarget=item;
 writeTypeFields(item.typeSpec);
 $('typeSplit').value='phrase';$('typeSplit').disabled=true;
 $('addType').textContent='Update fragment';$('cancelTypeEdit').hidden=false;
 toggleTypeTab(true);
}
function resetTypeEdit(){
 typeEditTarget=null;$('typeSplit').disabled=false;
 $('addType').textContent='Add to deck';$('cancelTypeEdit').hidden=true;
}
function closeType(){
 resetTypeEdit();toggleTypeTab(false);
}
async function addTypeToDeck(){
 if(typeEditBusy)return;
 const draft=readTypeFields(),modeAtStart=vf.active,editing=typeEditTarget;
 const words=splitTypeText(draft,editing?'phrase':$('typeSplit').value);
 if(!words.length)return;
 const capacity=editing?1:MAX_FRAGMENTS-assets.length;
 if(!capacity){$('typeStatus').textContent='The deck is full. Remove a fragment first.';return;}
 typeEditBusy=true;$('addType').disabled=true;
 try{
   const fragments=[];
   for(const text of words.slice(0,capacity))fragments.push(await makeTypeFragment({...draft,text}));
   if(modeAtStart!==vf.active){$('typeStatus').textContent='Return to the original deck and try again.';return;}
   if(editing){
     const at=assets.indexOf(editing);
     if(at<0){$('typeStatus').textContent='That fragment is no longer in this deck.';return;}
     assets[at]=fragments[0];
   }else{
     const room=MAX_FRAGMENTS-assets.length;
     fragments.splice(room);
     if(!fragments.length){$('typeStatus').textContent='The deck is full. Remove a fragment first.';return;}
     assets.push(...fragments);
   }
   const previousA=a,previousB=b,position=morph;
   showAssets();
   if(assets.length>fragments.length){a=previousA;b=previousB;morph=position;}
   resetTypeEdit();
   $('typeStatus').textContent=editing?'Type fragment updated.':'Added '+fragments.length+' type fragment'+(fragments.length===1?'':'s')+'.';
   report($('typeStatus').textContent);
 }catch(error){$('typeStatus').textContent=error.message;}
 finally{typeEditBusy=false;$('addType').disabled=!readTypeFields().text;}
}
function typeCount(){return assets.filter(item=>item.kind==='type').length;}
function mergeTypeWithMedia(media){
 const cards=assets.filter(item=>item.kind==='type');
 const room=MAX_FRAGMENTS-cards.length;
 for(const excess of media.slice(room))releaseFragment(excess);
 return [...media.slice(0,room),...cards];
}
function initType(){
 typeFontList();
 $('prevTypeFont').onclick=()=>stepTypeFont(-1);
 $('nextTypeFont').onclick=()=>stepTypeFont(1);
 $('typeTab').onclick=()=>toggleTypeTab($('typePanel').hidden);
 $('closeType').onclick=closeType;
 $('cancelTypeEdit').onclick=()=>{resetTypeEdit();previewType();};
 $('addType').onclick=addTypeToDeck;
 $('typePanel').addEventListener('input',event=>{if(event.target.id!=='typeFontFile')previewType();});
 $('typeFontFile').onchange=async event=>{
   const file=event.target.files[0];event.target.value='';
   if(!file)return;
   if(file.size>512*1024){$('typeStatus').textContent='Choose a font file under 512 KB.';return;}
   try{
     const buffer=await file.arrayBuffer();
     const hash=Array.from(new Uint8Array(await crypto.subtle.digest('SHA-256',buffer))).slice(0,12).map(v=>v.toString(16).padStart(2,'0')).join('');
     let binary='';for(const byte of new Uint8Array(buffer))binary+=String.fromCharCode(byte);
     const id=await registerTypeFont({id:'TypeFont-'+hash,name:file.name.replace(/\.[^.]+$/,''),data:btoa(binary)});
     typeFontList(id);previewType();
   }catch(error){$('typeStatus').textContent=error.message||'The font could not be loaded.';}
 };
}

import fs from 'node:fs';
const engine=fs.readFileSync(new URL('./video-engine.js',import.meta.url),'utf8');
export function integrateVideoEngine(html){
 const from=html.indexOf('async function loadImages(items,token){');
 const to=html.indexOf("$('excavate').onclick",from);
 if(from<0||to<0)throw Error('Missing fragment loader');
 html=html.slice(0,from)+engine+`
async function loadImages(items,token){
 const results=[],list=items.slice(0,MAX_FRAGMENTS);
 let failures=0,cursor=0;
 async function worker(){
   for(;;){
     const index=cursor++;
     if(index>=list.length || token!==searchToken)return;
     try{results[index]=await loadFragment(list[index]);}
     catch{failures++;releaseFragment(list[index]);}
     if(token===searchToken)report('Loading fragments: '+results.filter(Boolean).length+' ready'+(failures?', '+failures+' unavailable':'')+'…');
   }
 }
 const parallel=list.some(i=>i.kind==='video')?2:list.some(i=>i.source==='Local file')?4:8;
 await Promise.all(Array.from({length:Math.min(list.length,parallel)},worker));
 if(token!==searchToken){for(const item of list)releaseFragment(item);return null;}
 return {loaded:results.filter(Boolean),failures};
}
`+html.slice(to);
 html=html.replace('assets.map(asset=>asset.img)','assets.map(fragmentFrame)')
 .replaceAll('img.naturalWidth||img.width','img.videoWidth||img.naturalWidth||img.width')
 .replaceAll('img.naturalHeight||img.height','img.videoHeight||img.naturalHeight||img.height')
 .replace("function frame(ms){checkClipGate();","function frame(ms){if(frozen)syncFragmentPlayers();checkClipGate();")
 .replace(' const images=deck();ctx.globalCompositeOperation', ' syncFragmentPlayers();const images=deck();ctx.globalCompositeOperation')
 .replace('function showAssets(){','function showAssets(){reconcileFragmentDeck();')
 .replace('img.src=asset.image;img.alt=asset.title','img.loading="lazy";img.decoding="async";img.src=asset.poster||asset.image;img.alt=asset.title')
 .replace('date.textContent=asset.date;button.append','date.textContent=asset.kind==="video"?"Video clip":asset.date;button.append')
 .replace("?'LOCAL IMAGES':","?'LOCAL MEDIA':");
 return html;
}

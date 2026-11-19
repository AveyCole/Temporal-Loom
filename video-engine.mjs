import fs from 'node:fs';
const engine=fs.readFileSync(new URL('./video-engine.js',import.meta.url),'utf8');
export function integrateVideoEngine(html){
 const from=html.indexOf('async function loadImages(items,token){');
 const to=html.indexOf("$('excavate').onclick",from);
 if(from<0||to<0)throw Error('Missing fragment loader');
 html=html.slice(0,from)+engine+`
async function loadImages(items,token,onLoaded){
 const results=[],list=items.slice(0,MAX_FRAGMENTS),handled=new Set();
 let failures=0,cursor=0,ready=0;
 async function worker(){
   for(;;){
     const index=cursor++;
     if(index>=list.length || token!==searchToken)return;
     try{
       const asset=await loadFragment(list[index],Boolean(onLoaded));
       if(token!==searchToken){discardPreparedVideo(asset);return;}
       if(onLoaded){
         let published;
         try{
           published=onLoaded(asset);
           if(published&&asset.kind==='video')syncFragmentPlayers();
         }finally{discardPreparedVideo(asset);}
         handled.add(index);
         if(!published){releaseFragment(asset);continue;}
       }
       results[index]=asset;ready++;
     }catch{
       failures++;handled.add(index);releaseFragment(list[index]);
     }
     if(!onLoaded&&token===searchToken)report('Loading fragments: '+ready+' ready'+(failures?', '+failures+' unavailable':'')+'…');
   }
 }
 const parallel=list.some(i=>i.kind==='video')?2:list.some(i=>i.source==='Local file')?4:8;
 await Promise.all(Array.from({length:Math.min(list.length,parallel)},worker));
 if(token!==searchToken){
   for(let i=0;i<list.length;i++)if(!handled.has(i))releaseFragment(list[i]);
   return null;
 }
 return {loaded:results.filter(Boolean),failures};
}
`+html.slice(to);
 html=html.replace('assets.map(asset=>asset.img)','assets.map(fragmentFrame)')
 .replaceAll('img.naturalWidth||img.width','img.videoWidth||img.naturalWidth||img.width')
 .replaceAll('img.naturalHeight||img.height','img.videoHeight||img.naturalHeight||img.height')
 .replace("function frame(ms){checkClipGate();","function frame(ms){if(frozen)syncFragmentPlayers();checkClipGate();")
 .replace(' const images=deck();ctx.globalCompositeOperation', ' syncFragmentPlayers();const images=deck();ctx.globalCompositeOperation')
 .replace('function showAssets(){','function showAssets(start=0,preserveStage=false){reconcileFragmentDeck();deckShuffle.disabled=assets.length<2;')
 .replace("$('assets').replaceChildren();$('sources').replaceChildren();","if(!start){$('assets').replaceChildren();$('sources').replaceChildren();}")
 .replace('assets.forEach((asset,index)=>{const button=','assets.slice(start).forEach((asset,offset)=>{const index=start+offset;const button=')
 .replace('a=0;b=assets.length>1?1:0;morph=0;manual=false;',
   'if(!preserveStage&&!start){a=0;b=assets.length>1?1:0;morph=0;manual=false;}else if(start===1){b=1;morph=0;}')
 .replace('img.src=asset.image;img.alt=asset.title','img.loading="lazy";img.decoding="async";img.src=asset.poster||asset.image;img.alt=asset.title')
 .replace('date.textContent=asset.date;button.append','date.textContent=asset.kind==="video"?"Video clip":asset.date;button.append')
 .replace("?'LOCAL IMAGES':","?'LOCAL MEDIA':");
 return html;
}

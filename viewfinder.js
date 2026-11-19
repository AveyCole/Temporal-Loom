async function fieldJSON(url,timeout=24000){
 const r=await fetch('/relay?url='+encodeURIComponent(url),{signal:AbortSignal.timeout(timeout)});
 if(!r.ok)throw Error('The sound or image archive is unavailable. Try again.');
 return r.json();
}
async function randomField(){
 // A random identifier prefix keeps deep pagination out of the archive query.
 const prefix=100+Math.floor(Math.random()*900);
 const p=new URLSearchParams({q:'collection:radio-aporee-maps AND identifier:aporee_'+prefix+'* AND mediatype:audio',output:'json',rows:'70','fl[]':'identifier'});
 const list=(await fieldJSON('https://archive.org/advancedsearch.php?'+p)).response.docs;
 while(list.length){
   const id=list.splice(Math.floor(Math.random()*list.length),1)[0].identifier;
   if(!/^aporee_\d+_\d+$/.test(id))continue;
   const data=await fieldJSON('https://archive.org/metadata/'+id),m=data.metadata||{};
   const track=(data.files||[]).filter(f=>/\.mp3$/i.test(f.name)&&+f.size>0&&+f.size<48*1024*1024).sort((a,b)=>a.size-b.size)[0];
   const place=(String(m.coverage||'').match(/(?:^|;)\s*name=([^;]+)/i)||[])[1]||String(m.title||'').split(' - ')[0];
   if(!track||!place)continue;
   return {id,place,title:String(m.title||place),artist:String(m.creator||'Radio Aporee contributor'),lat:parseFloat(m.latitude),lon:parseFloat(m.longitude),src:'https://archive.org/download/'+id+'/'+encodeURIComponent(track.name)};
 }
 throw Error('No playable sound in this selection. Try another recording.');
}
function locationPages(sound,media){
 const parts=sound.place.split(',').map(v=>v.trim()).filter(Boolean);
 const areaParts=parts.length>1?parts.slice(0,-1).reverse():parts;
 const queries=[sound.title.split(' - ')[0],...areaParts.map(v=>v.replace(/\b[A-Z]{1,2}\d[A-Z\d]?\s*\d[A-Z]{2}\b/ig,'').replace(/\b\d{3,6}\b/g,'').trim())];
 const places=[...new Set(queries)].filter(place=>place.length>2);
 const streams=[];
 if(media!=='videos')streams.push(locationPhotoPages(sound,places));
 if(media!=='photos')streams.push(locationVideoPages(sound,places));
 return mergeSearchPages(streams);
}
async function* locationVideoPages(sound,places){
 let issue='',found=false;
 for(const place of places){
   try{
     for await(const page of commonsVideoPages(place)){
       if(page.items.length)found=true;
       yield {items:page.items.map(item=>({...item,date:sound.place,area:place}))};
     }
   }catch(error){issue=error.message;}
 }
 if(!found&&issue)yield {items:[],issue};
}
async function* locationPhotoPages(sound,places){
 const base={action:'query',format:'json',prop:'imageinfo',iiprop:'url|mime',iiurlwidth:'640'};
 const searches=[];
 if(Number.isFinite(sound.lat)&&Number.isFinite(sound.lon))searches.push({generator:'geosearch',ggscoord:sound.lat+'|'+sound.lon,ggsradius:'10000',ggsnamespace:'6',ggslimit:'30'});
 for(const query of places)searches.push({generator:'search',gsrsearch:query,gsrnamespace:'6',gsrlimit:'30'});
 for(const params of searches){
   let cursor={},previous;const area=params.gsrsearch||'';
   do{
     const url=new URLSearchParams({...base,...params,...cursor});
     const data=await fieldJSON('https://commons.wikimedia.org/w/api.php?'+url);
     if(data.error)throw Error(data.error.info||'Location search unavailable.');
     const items=Object.values(data.query?.pages||{}).flatMap(page=>{
       const info=page.imageinfo?.[0];
       if(!info?.thumburl||!/^image\/(jpeg|png|webp)$/i.test(info.mime)||!info.descriptionurl?.startsWith('https://commons.wikimedia.org/'))return [];
       return [{title:page.title.replace(/^File:/,''),source:'Wikimedia Commons',date:sound.place,link:info.descriptionurl,image:'/web-image?url='+encodeURIComponent(info.thumburl),area}];
     });
     yield {items};previous=JSON.stringify(cursor);cursor=data.continue;
   }while(cursor&&JSON.stringify(cursor)!==previous);
 }
}
const vf={active:false,studio:null,pair:null};
function snapshotDeck(){
 return {...captureAudioState(),assets,fragmentSoundtrack,title:$('performanceTitle').textContent,caption:$('caption').textContent};
}
function restoreDeck(snapshot){
 restoreAudioSource(snapshot);
 setFragmentSoundtrack(snapshot.fragmentSoundtrack||null);
 assets=snapshot.assets;showAssets();
 if(!assets.length){$('fragmentCount').textContent='DEMO MODE';$('stageOrigin').textContent='SYNTHETIC DEMO';}
 $('caption').textContent=snapshot.caption;$('performanceTitle').textContent=snapshot.title;
 $('driver').value=snapshot.driver==='mic'&&$('micButton').textContent!=='Mic on'?'drift':snapshot.driver;$('driver').onchange();
}
function switchTab(on){
 if(!$('typePanel').hidden)closeType();
 if(on===vf.active)return;
 if(clipRecorder){report('Finish the clip before switching tabs.');return;}
 ++searchToken;vf.active=on;$('pairButton').disabled=false;$('excavate').disabled=false;
 document.body.classList.toggle('viewfinding',on);$('radioPanel').hidden=!on;
 $('studioTab').setAttribute('aria-pressed',String(!on));$('vfTab').setAttribute('aria-pressed',String(on));
 if(on){vf.studio=snapshotDeck();restoreDeck(vf.pair?.deck||{assets:[],src:null,time:0,driver:'drift',title:'Viewfinder',name:'',caption:'Choose a random recording.'});}
 else{if(vf.pair)vf.pair.deck=snapshotDeck();restoreDeck(vf.studio);}
 window.scrollTo(0,0);
}
$('vfTab').onclick=()=>switchTab(true);$('studioTab').onclick=()=>switchTab(false);
$('pairButton').onclick=async()=>{
 if(clipRecorder){report('Finish the clip before changing recordings.');return;}
 const target=chooseMediaTarget(),token=++searchToken,media=mediaMode(),live=()=>token===searchToken&&vf.active;
 if(!target){report('The deck is full of type fragments. Remove one to make room.');return;}
 $('pairButton').disabled=true;let temp=null;
 try{
   await ensureAudio();
   for(let attempt=0;attempt<3;attempt++){
     if(!live())return;
     $('pairStatus').textContent='Finding a field recording…';
     const sound=await randomField();if(!live())return;
     $('pairStatus').textContent='Searching for '+mediaModes[media]+' of '+sound.place+'…';
     const deckData=await collectFragments(locationPages(sound,media),token,target,media);if(!live())return;
     if(!deckData?.loaded.length){if(deckData?.issue)throw Error(deckData.issue);continue;}
     const area=deckData.loaded.find(item=>item.area)?.area;
     const basis=area?'Includes area matches for '+area:'Photos tagged within 10 km';
     $('pairStatus').textContent='Loading '+sound.title+'…';
     const r=await fetch('/field-audio?url='+encodeURIComponent(sound.src),{signal:AbortSignal.timeout(75000)});
     if(!r.ok)continue;
     temp=URL.createObjectURL(await r.blob());if(!live())return;
     const probe=new Audio();await new Promise((ok,fail)=>{const timer=setTimeout(()=>fail(Error('Audio load timed out.')),12000);probe.onloadedmetadata=()=>{clearTimeout(timer);ok();};probe.onerror=()=>{clearTimeout(timer);fail(Error('Recording unavailable.'));};probe.src=temp;});
     if(!live())return;
     const previous=vf.pair?.url;
     discardFragmentAudio();
     restoreDeck({assets:mergeTypeWithMedia(deckData.loaded),src:temp,time:0,driver:'audio',title:sound.place,name:sound.title,caption:sound.title});
     vf.pair={url:temp,deck:snapshotDeck()};temp=null;if(previous)URL.revokeObjectURL(previous);
     $('pairStatus').textContent=sound.title+' · '+sound.artist+' · '+basis;
     $('fieldLink').href='https://archive.org/details/'+sound.id;$('fieldLink').hidden=false;
     $('stageOrigin').textContent='VIEWFINDER';report(fragmentResultText(deckData.loaded.length,target,deckData.issue));
     try{await fileAudio.play();}catch{report('Tap Play to hear the paired recording.');}return;
   }
   throw Error('No usable recording paired with '+mediaModes[media]+'. Try another location or media type.');
 }catch(e){if(live())$('pairStatus').textContent=e.message;}finally{if(temp)URL.revokeObjectURL(temp);if(live())$('pairButton').disabled=false;}
};
let fullscreenControlsTimer;
function setStageFull(on){
 clearTimeout(fullscreenControlsTimer);
 document.documentElement.classList.toggle('stage-fullscreen',on);
 const stage=$('stageWrap');
 stage.classList.remove('show-fullscreen-controls');
 stage.classList.toggle('expanded',on);
 $('fullscreen').textContent=on?'Exit fullscreen':'Fullscreen';
 demos=[demo(0),demo(1),demo(2)];
 Mic.full(on);
 requestAnimationFrame(dimensions);
}
$('stageWrap').addEventListener('click',event=>{
 const stage=$('stageWrap');
 if(!stage.classList.contains('expanded')||event.target!==canvas)return;
 stage.classList.add('show-fullscreen-controls');
 clearTimeout(fullscreenControlsTimer);
 fullscreenControlsTimer=setTimeout(()=>stage.classList.remove('show-fullscreen-controls'),4000);
});
window.addEventListener('keydown',event=>{
 if(event.key==='Escape'&&$('stageWrap').classList.contains('expanded')){event.preventDefault();setStageFull(false);}
});
$('fullscreen').onclick=()=>setStageFull(!$('stageWrap').classList.contains('expanded'));
$('micButton').classList.remove('wide');$('topMic').append($('micButton'));
function validCommonsReference(item){
 try{
   return item.source==='Wikimedia Commons'&&new URL(item.link).hostname==='commons.wikimedia.org'&&item.link.startsWith('https://')&&item.image.startsWith('/web-image?')&&['upload.wikimedia.org','thumb.wikimedia.org'].includes(new URL(new URL(item.image,location.origin).searchParams.get('url')).hostname);
 }catch{return false;}
}

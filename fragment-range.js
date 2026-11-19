const DEFAULT_FRAGMENT_RANGE={min:10,max:50};
function readFragmentRange(){
 const clamp=(value,fallback)=>Math.max(1,Math.min(MAX_FRAGMENTS,Math.round(Number(value)||fallback)));
 const min=clamp($('fragmentMin').value,DEFAULT_FRAGMENT_RANGE.min),max=clamp($('fragmentMax').value,DEFAULT_FRAGMENT_RANGE.max);
 return {min,max:Math.max(min,max)};
}
function setFragmentRange(range){
 $('fragmentMin').value=range?.min??DEFAULT_FRAGMENT_RANGE.min;
 $('fragmentMax').value=range?.max??DEFAULT_FRAGMENT_RANGE.max;
 const value=readFragmentRange();$('fragmentMin').value=value.min;$('fragmentMax').value=value.max;
 $('rangeLabel').textContent='Fragments · '+(value.min===value.max?value.min:value.min+'–'+value.max);
 localStorage.setItem('fragmentRange',JSON.stringify(value));
}
function chooseFragmentTarget(){
 const {min,max}=readFragmentRange();
 return min+Math.floor(Math.random()*(max-min+1));
}
function chooseMediaTarget(){
 return Math.min(chooseFragmentTarget(),MAX_FRAGMENTS-typeCount());
}
function fragmentResultText(count,target,issue){
 if(count===target)return 'Loaded '+target+' of '+target+' fragments.'+(issue?' '+issue:'');
 const reason=issue?'Search interrupted. '+issue:'No more usable candidates were returned.';
 return 'Found '+count+' of '+target+' fragments. '+reason;
}
async function collectFragments(pages,token,target,media='both'){
 const loaded=[],seen=new Set();let failures=0,issue='';
 const cancelled=()=>{for(const asset of loaded)releaseFragment(asset);return null;};
 try{
   for await(const page of pages){
     if(token!==searchToken)return cancelled();
     if(page.issue)issue=page.issue;
     if(page.dates)$('dateNote').textContent='Search dates · '+page.dates.start+' to '+page.dates.end;
     const items=page.items.filter(item=>{
       if(!mediaMatches(item,media))return false;
       const ref=item.source==='Google Images'||item.source==='Wikipedia'?item.image:(item.link||item.image);
       const key=(item.kind==='video'?'video:':'image:')+ref;
       if(!ref||seen.has(key))return false;seen.add(key);return true;
     });
     for(let cursor=0;cursor<items.length;){
       const batch=items.slice(cursor,cursor+Math.min(8,target-loaded.length));cursor+=batch.length;
       const result=await loadImages(batch,token);
       if(!result||token!==searchToken)return cancelled();
       loaded.push(...result.loaded);failures+=result.failures;
       const status='Searching · '+loaded.length+' / '+target+' usable fragments';
       report(status);if(vf.active)$('pairStatus').textContent=status;
       if(loaded.length===target)return {loaded,failures,issue};
     }
   }
 }catch(e){issue=e.message||'Source unavailable.';}
 return token===searchToken?{loaded,failures,issue}:cancelled();
}
async function gatherArchiveByCount(){
 clearSearchTerms();
 const source=$('source').value,media=mediaMode();
 if(source==='google'&&media==='videos'){report('Google Images returns stills. Choose Photos or Both, or use a video source.');return;}
 if(['nasa','peertube','commons-video','ia-video'].includes(source)&&media==='photos'){report('This catalog supplies videos. Choose Videos or Both, or use a photo source.');return;}
 const token=++searchToken,target=chooseMediaTarget();
 if(!target){report('The deck is full of type fragments. Remove one to make room.');return;}
 $('excavate').disabled=true;report('Searching '+mediaModes[media]+' for '+target+' usable fragments…');
 try{
   const query=new URLSearchParams({date:$('date').value,window:$('window').value,source,genre:$('genre').value,site:$('site').value,words:$('words').value,media});
   for(const k of types)query.set(k,$(k).value);
   const pages=$('abstractSearch').checked?abstractSearchPages(query,token):searchAllPages(query);
   const result=await collectFragments(pages,token,target,media);
   if(!result||token!==searchToken)return;
   if(result.loaded.length){assets=mergeTypeWithMedia(result.loaded);showAssets();}
   report(fragmentResultText(result.loaded.length,target,result.issue));
 }finally{if(token===searchToken)$('excavate').disabled=false;}
}
function initFragmentRange(){
 for(const id of ['fragmentMin','fragmentMax'])$(id).max=MAX_FRAGMENTS;
 let stored;try{stored=JSON.parse(localStorage.getItem('fragmentRange'));}catch{}
 if(localStorage.getItem('fragmentRangeDefaults')!=='10-50'){
   const previous=stored?.min+'-'+stored?.max;
   if(['1-1','1-50','8-16'].includes(previous))stored=undefined;
   localStorage.setItem('fragmentRangeDefaults','10-50');
 }
 setFragmentRange(stored);
 $('resetFragmentRange').onclick=()=>setFragmentRange(DEFAULT_FRAGMENT_RANGE);
 $('fragmentMin').onchange=()=>setFragmentRange(readFragmentRange());
 $('fragmentMax').onchange=()=>{if(+$('fragmentMax').value>0&&+$('fragmentMax').value<+$('fragmentMin').value)$('fragmentMin').value=$('fragmentMax').value;setFragmentRange(readFragmentRange());};
 $('cancelFind').onclick=()=>{++searchToken;$('excavate').disabled=false;$('pairButton').disabled=false;$('cancelFind').hidden=true;report('Search cancelled.');if(vf.active)$('pairStatus').textContent='Search cancelled.';};
 const sync=()=>{$('cancelFind').hidden=!$('excavate').disabled&&!$('pairButton').disabled;};
 const observer=new MutationObserver(sync);
 for(const btn of [$('excavate'),$('pairButton')])observer.observe(btn,{attributes:true,attributeFilter:['disabled']});
}

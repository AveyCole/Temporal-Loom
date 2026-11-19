let googleSequence=0, pendingGoogle=null, googleQueue=Promise.resolve();
function googleResult(id,items,issue){
 if(pendingGoogle?.id===id)pendingGoogle.finish({items,issue});
}
function requestGooglePage(terms,offset,token){
 if(pendingGoogle&&pendingGoogle.token!==token)googleResult(pendingGoogle.id,[]);
 googleQueue=googleQueue.then(()=>{
   if(token!==searchToken)return {items:[]};
   return new Promise(resolve=>{
     const id=++googleSequence;
     const timer=setTimeout(()=>googleResult(id,[],'Google Images timed out.'),16000);
     pendingGoogle={id,token,finish(result){clearTimeout(timer);pendingGoogle=null;resolve(result);}};
     try{Mic.googleSearch(id,terms,offset);}
     catch{googleResult(id,[],'Google Images unavailable.');}
   });
 });
 return googleQueue;
}
async function* googlePages(terms,token){
 const seen=new Set();
 for(let offset=0;token===searchToken;offset+=20){
   const page=await requestGooglePage(terms,offset,token);
   const items=page.items.filter(item=>{if(seen.has(item.image))return false;seen.add(item.image);return true;});
   yield {items,issue:page.issue};if(!items.length)return;
 }
}
async function* wikiPages(terms){
 let cursor={},previous='';
 do{
   const query=new URLSearchParams({action:'query',format:'json',generator:'search',gsrsearch:terms,gsrnamespace:'0',gsrlimit:'24',prop:'pageimages|info',inprop:'url',piprop:'thumbnail',pithumbsize:'640',pilimit:'max',...cursor});
   const data=await fieldJSON('https://en.wikipedia.org/w/api.php?'+query);
   if(data.error)throw Error(data.error.info||'Wikipedia search failed.');
   const items=Object.values(data.query?.pages||{}).filter(p=>p.thumbnail?.source&&p.fullurl).map(p=>({image:'/web-image?url='+encodeURIComponent(p.thumbnail.source),link:p.fullurl,title:p.title,source:'Wikipedia',date:'Article image'}));
   yield {items};previous=JSON.stringify(cursor);cursor=data.continue;
 }while(cursor&&JSON.stringify(cursor)!==previous);
}
async function* wikiRandomPages(){
 const seen=new Set();
 while(true){
   const params=new URLSearchParams({action:'query',format:'json',generator:'random',grnnamespace:'0',grnlimit:24,prop:'pageimages|info',inprop:'url',piprop:'thumbnail',pithumbsize:640,pilimit:'max'});
   const data=await fieldJSON('https://en.wikipedia.org/w/api.php?'+params);
   if(data.error)throw Error(data.error.info||'Wikipedia search failed.');
   const items=[];let fresh=0;
   for(const page of Object.values(data.query?.pages||{})){
     if(seen.has(page.pageid))continue;
     seen.add(page.pageid);
     fresh++;
     if(page.thumbnail?.source&&page.fullurl)items.push({image:'/web-image?url='+encodeURIComponent(page.thumbnail.source),link:page.fullurl,title:page.title,source:'Wikipedia',date:'Article image'});
   }
   yield {items};
   if(!fresh)return;
 }
}
function splitSeedTerms(value){
 const seen=new Set();
 return (value||'').split(',').map(phrase=>phrase.trim()).filter(phrase=>{
   const key=phrase.toLowerCase().replace(/\s+/g,' ');
   if(!key||seen.has(key))return false;
   seen.add(key);return true;
 });
}
function searchAllPages(query,token=searchToken){
 const terms=splitSeedTerms(query.get('words'));
 if(terms.length<2)return searchTermPages(query,terms[0]||'',token);
 return mergeSearchPages(terms.map(term=>searchTermPages(query,term,token)),{mixKinds:false,parallel:4,token});
}
function searchTermPages(query,seed,token){
 const source=query.get('source'),media=query.get('media');
 const terms=seed||(query.get('genre')==='none'?'':$('genre').selectedOptions[0].text);
 const streams=[];
 if(media!=='photos'){
   if(['blended','nasa'].includes(source))streams.push(nasaVideoPages(terms));
   if(['blended','peertube'].includes(source))streams.push(peerTubeVideoPages(terms));
   if(['blended','wikipedia','commons-video'].includes(source))streams.push(commonsVideoPages(terms));
   if(source==='ia-video')streams.push(archiveVideoCatalogPages(terms));
 }
 if(media!=='videos'){
   if(['blended','google'].includes(source))streams.push(googlePages(terms||'photography art landscape history people',token));
   if(['blended','wikipedia'].includes(source))streams.push(terms?wikiPages(terms):wikiRandomPages());
 }
 if(!['google','wikipedia','nasa','peertube','commons-video','ia-video'].includes(source)){
   const archiveQuery=new URLSearchParams(query);
   archiveQuery.set('words',seed);
   streams.push(archivePages(archiveQuery));
 }
 return mergeSearchPages(streams,{token});
}
function mixMedia(items,videoFirst=false){
 const photos=[],videos=[];
 for(const item of items)(item.kind==='video'?videos:photos).push(item);
 const mixed=[],groups=videoFirst?[videos,photos]:[photos,videos];
 for(let n=0;n<Math.max(photos.length,videos.length);n++)for(const group of groups)if(group[n])mixed.push(group[n]);
 return mixed;
}
async function* mergeSearchPages(streams,{mixKinds=true,parallel=streams.length,token=searchToken}={}){
 let previewed=false,videoFirst=false;
 while(streams.length&&token===searchToken){
   const lanes=Array(Math.min(parallel,streams.length)).fill(Promise.resolve());
   const reads=streams.map((stream,index)=>{
     const lane=index%lanes.length;
     const read=lanes[lane].then(()=>token===searchToken?stream.next():{done:true});
     lanes[lane]=read.catch(()=>{});
     return read;
   });
   const settled=Promise.allSettled(reads);
   let preview;
   if(!previewed&&reads.length>1){
     preview=await Promise.any(reads.map(async read=>{
       const {value}=await read;
       if(value?.items.length)return value;
       throw Error('No candidates in this page.');
     })).catch(()=>null);
     if(token!==searchToken)return;
     if(preview){
       previewed=true;
       videoFirst=preview.items[0].kind!=='video';
       yield {items:[preview.items[0]],dates:preview.dates};
     }
   }
   const batches=await settled;
   if(token!==searchToken)return;
   const groups=[],issues=[];let dates;
   for(let i=batches.length-1;i>=0;i--){
     const row=batches[i];
     if(row.status==='rejected'){issues.push(row.reason.message);streams.splice(i,1);continue;}
     if(row.value.done){streams.splice(i,1);continue;}
     const page=row.value.value;groups.unshift(page===preview?page.items.slice(1):page.items);if(page.issue)issues.push(page.issue);if(page.dates)dates=page.dates;
   }
   const items=[];for(let n=0;groups.some(group=>group.length>n);n++)for(const group of groups)if(group[n])items.push(group[n]);
   const mixed=mixKinds?mixMedia(items,videoFirst):items;
   if(mixed.length)videoFirst=mixed.at(-1).kind!=='video';
   yield {items:mixed,issue:issues.join(' '),dates};
 }
}
function validSearchReference(item){
 if(!['Google Images','Wikipedia'].includes(item.source)||typeof item.image!=='string'||typeof item.link!=='string'||!item.link.startsWith('https://'))return false;
 if(item.source==='Google Images'&&/^\/google-thumb\/[0-9a-f]{64}$/.test(item.image))return true;
 if(!item.image.startsWith('/web-image?'))return false;
 try{return new URL(new URLSearchParams(item.image.split('?')[1]).get('url')).protocol==='https:';}catch{return false;}
}

let googleSequence=0, resolveGoogle=null;
function googleResult(id,items,issue){
 if(id!==googleSequence||!resolveGoogle)return;
 const finish=resolveGoogle;resolveGoogle=null;finish({items,issue});
}
async function* googlePages(terms){
 const seen=new Set();
 for(let offset=0;;offset+=20){
   if(resolveGoogle)googleResult(googleSequence,[],'Search superseded.');
   const id=++googleSequence;
   const page=await new Promise(resolve=>{
     const timer=setTimeout(()=>googleResult(id,[],'Google Images timed out.'),16000);
     resolveGoogle=result=>{clearTimeout(timer);resolve(result);};
     Mic.googleSearch(id,terms,offset);
   });
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
function searchAllPages(query){
 const source=query.get('source'),media=query.get('media');
 const words=query.get('words').split(',').map(t=>t.trim()).filter(Boolean);
 const terms=words.join(' ')||(query.get('genre')==='none'?'':$('genre').selectedOptions[0].text);
 const videoTerms=[...new Set([terms,...words])];
 const streams=[];
 if(media!=='photos'){
   if(['blended','nasa'].includes(source))streams.push(videoCatalogPages(nasaVideoPages,videoTerms));
   if(['blended','peertube'].includes(source))streams.push(videoCatalogPages(peerTubeVideoPages,videoTerms));
   if(['blended','wikipedia','commons-video'].includes(source))streams.push(videoCatalogPages(commonsVideoPages,videoTerms));
   if(source==='ia-video')streams.push(videoCatalogPages(archiveVideoCatalogPages,videoTerms));
 }
 if(media!=='videos'){
   if(['blended','google'].includes(source))streams.push(googlePages(terms||'photography art landscape history people'));
   if(['blended','wikipedia'].includes(source))streams.push(terms?wikiPages(terms):wikiRandomPages());
 }
 if(!['google','wikipedia','nasa','peertube','commons-video','ia-video'].includes(source))streams.push(archivePages(query));
 return mergeSearchPages(streams);
}
function mixMedia(items){
 const photos=[],videos=[];
 for(const item of items)(item.kind==='video'?videos:photos).push(item);
 const mixed=[];
 for(let n=0;n<Math.max(photos.length,videos.length);n++){
   if(photos[n])mixed.push(photos[n]);
   if(videos[n])mixed.push(videos[n]);
 }
 return mixed;
}
async function* mergeSearchPages(streams){
 while(streams.length){
   const batches=await Promise.allSettled(streams.map(stream=>stream.next()));
   const groups=[],issues=[];let dates;
   for(let i=batches.length-1;i>=0;i--){
     const row=batches[i];
     if(row.status==='rejected'){issues.push(row.reason.message);streams.splice(i,1);continue;}
     if(row.value.done){streams.splice(i,1);continue;}
     const page=row.value.value;groups.unshift(page.items);if(page.issue)issues.push(page.issue);if(page.dates)dates=page.dates;
   }
   const items=[];for(let n=0;groups.some(group=>group.length>n);n++)for(const group of groups)if(group[n])items.push(group[n]);
   yield {items:mixMedia(items),issue:issues.join(' '),dates};
 }
}
function validSearchReference(item){
 if(!['Google Images','Wikipedia'].includes(item.source)||typeof item.image!=='string'||typeof item.link!=='string'||!item.link.startsWith('https://'))return false;
 if(item.source==='Google Images'&&/^\/google-thumb\/[0-9a-f]{64}$/.test(item.image))return true;
 if(!item.image.startsWith('/web-image?'))return false;
 try{return new URL(new URLSearchParams(item.image.split('?')[1]).get('url')).protocol==='https:';}catch{return false;}
}

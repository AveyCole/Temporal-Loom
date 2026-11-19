const archivePages=(()=>{

const json=(data,status=200)=>new Response(JSON.stringify(data),{status,headers:{'content-type':'application/json','cache-control':'no-store'}});
function dateWindow(value,radius){
 if(!/^\d{4}-\d{2}-\d{2}$/.test(value||''))throw Error('Choose a valid date.');
 const date=new Date(value+'T00:00:00Z');if(!Number.isFinite(+date)||date.toISOString().slice(0,10)!==value)throw Error('Choose a real calendar date.');
 const today=new Date();
 if(date.getUTCFullYear()<1850||date>today)throw Error('Choose a date between 1850 and today.');
 const days=[0,30,365,1825,3650,5475,7300,9125,10950].includes(Number(radius))?Number(radius):365;
 function endpoint(direction){
   if(days<365)return new Date(+date+direction*days*86400000);
   // Keep calendar anniversaries, rounding February 29 down in non-leap years.
   const year=date.getUTCFullYear()+direction*(days/365),month=date.getUTCMonth();
   const lastDay=new Date(Date.UTC(year,month+1,0)).getUTCDate();
   return new Date(Date.UTC(year,month,Math.min(date.getUTCDate(),lastDay)));
 }
 const iso=d=>d.toISOString().slice(0,10);
 const end=endpoint(1);
 return {selected:value,start:iso(endpoint(-1)),end:iso(end>today?today:end),days};
}
async function archiveJSON(url){
 const response=await fetch('/relay?url='+encodeURIComponent(url),{signal:AbortSignal.timeout(22000)});
 if(!response.ok)throw Error('Archive unavailable');return response.json();
}
async function searchSource(params,page){

 const dates=dateWindow(params.get('date'),params.get('window'));
 if(params.get('source')==='wayback'){
  let site;try{site=new URL(params.get('site'));}catch{throw Error('Enter an https:// website or image URL for Wayback.');}
  if(!/^https?:$/.test(site.protocol)||site.username||site.password||site.hostname==='localhost'||!site.hostname.includes('.'))throw Error('Enter a public website URL.');
  const video=params.get('category')==='Videos';
  const image=/\.(jpe?g|png|gif|webp|mp4|webm)$/i.test(site.pathname);
  const endpoint=new URL('https://web.archive.org/cdx/search/cdx');
  endpoint.searchParams.set('url',image?site.href:site.href.replace(/\/?$/,'/'));
  endpoint.searchParams.set('matchType',image?'exact':'prefix');
  endpoint.searchParams.set('output','json');endpoint.searchParams.set('fl','timestamp,original,mimetype,statuscode');
  endpoint.searchParams.append('filter','statuscode:200');endpoint.searchParams.append('filter',video?'mimetype:video/(mp4|webm)':'mimetype:image/(jpeg|png|gif|webp)');
  endpoint.searchParams.set('from',dates.start.replaceAll('-',''));endpoint.searchParams.set('to',dates.end.replaceAll('-',''));
  endpoint.searchParams.set('collapse','digest');endpoint.searchParams.set('limit','40');endpoint.searchParams.set('offset',String((page-1)*40));
  const rows=await archiveJSON(endpoint);if(!Array.isArray(rows))throw Error('Wayback returned no capture index.');
  const score=row=>Math.abs(Date.parse(row[0].slice(0,4)+'-'+row[0].slice(4,6)+'-'+row[0].slice(6,8))-Date.parse(dates.selected));
  const images=rows.slice(1).filter(row=>/^\d{14}$/.test(row[0])&&/^https?:/.test(row[1]||''));
  images.sort((a,b)=>{const relevance=r=>(params.get('words')||'').toLowerCase().split(',').map(v=>v.trim()).filter(Boolean).some(term=>r[1].toLowerCase().includes(term))?1:0;return relevance(b)-relevance(a)||score(a)-score(b);});
  return {more:rows.length>40,dates,assets:images.map(row=>({
    title:new URL(row[1]).pathname.split('/').pop()||row[1],
    date:row[0].slice(0,4)+'-'+row[0].slice(4,6)+'-'+row[0].slice(6,8),
    source:'Wayback',kind:video?'video':'image',link:'https://web.archive.org/web/'+row[0]+'/'+row[1],
    image:video?'/web-video?url='+encodeURIComponent('https://web.archive.org/web/'+row[0]+'id_/'+row[1]):'/api/image?kind=wayback&timestamp='+row[0]+'&url='+encodeURIComponent(row[1])
  }))};
 }
 const genreTerms=typeof GENRES!=='undefined'?(GENRES[params.get('genre')]?.terms||[]):[];
 const words=params.get('words').split(',').map(t=>t.replace(/[^\p{L}\p{N} -]/gu,'').trim()).filter(Boolean); const terms=(words.length?words:genreTerms).map(t=>'"'+t+'"').join(' OR ');
 const q=categoryQueries[params.get('category')]+' AND date:['+dates.start+'T00:00:00Z TO '+dates.end+'T23:59:59Z]'+(terms?' AND ('+terms+')':'');
 const endpoint=new URL('https://archive.org/advancedsearch.php');endpoint.searchParams.set('q',q);endpoint.searchParams.set('output','json');endpoint.searchParams.set('rows','24');endpoint.searchParams.set('page',String(page));endpoint.searchParams.set('sort[]','identifier asc');
 for(const field of ['identifier','title','date','mediatype'])endpoint.searchParams.append('fl[]',field);
 const result=await archiveJSON(endpoint);const docs=result.response?.docs;if(!Array.isArray(docs))throw Error('Archive search is temporarily unavailable.');
 docs.sort((a,b)=>Math.abs(Date.parse(a.date)-Date.parse(dates.selected))-Math.abs(Date.parse(b.date)-Date.parse(dates.selected)));
 const video=params.get('category')==='Videos';
 return {more:docs.length>0 && page*24<result.response.numFound,dates,assets:docs.filter(d=>/^[\w.-]+$/.test(d.identifier)).map(d=>({
   title:d.title||d.identifier,date:String(d.date||'Unknown').slice(0,10),source:'Internet Archive',
   link:'https://archive.org/details/'+d.identifier,kind:video?'video':'image',
   image:(video?'/archive-video?id=':'/api/image?kind=ia&id=')+encodeURIComponent(d.identifier)
 }))};
}
const GENRES = {
 none:{name:'Any genre',sites:['https://www.loc.gov/','https://www.si.edu/','https://www.nasa.gov/','https://www.flickr.com/'],terms:[]},
 art:{name:'Art & design',sites:['https://www.metmuseum.org/','https://www.tate.org.uk/'],terms:['art','design','painting','illustration','sculpture']},
 people:{name:'People & everyday life',sites:['https://www.loc.gov/','https://www.si.edu/'],terms:['portrait','family','street','festival','community']},
 history:{name:'History & documentary',sites:['https://www.loc.gov/','https://www.archives.gov/'],terms:['history','documentary','historical','archive']},
 travel:{name:'Travel & landscapes',sites:['https://www.nps.gov/','https://www.loc.gov/'],terms:['travel','landscape','mountain','coast','tourism']},
 industry:{name:'Industry & technology',sites:['https://www.si.edu/','https://www.nasa.gov/'],terms:['industry','machine','manufacturing','engineering','technology']},
 ephemera:{name:'Print & ephemera',sites:['https://www.loc.gov/','https://www.si.edu/'],terms:['poster','advertising','magazine']},
 broadcast:{name:'Broadcast & music',sites:['https://www.bbc.co.uk/','https://www.mtv.com/'],terms:['television','music','broadcast']},
 science:{name:'Space & science',sites:['https://www.nasa.gov/','https://www.jpl.nasa.gov/'],terms:['space','science','astronomy']},
 digital:{name:'Early web & games',sites:['https://www.geocities.com/','https://www.wired.com/'],terms:['computer','game','internet']},
 nature:{name:'Nature & field studies',sites:['https://www.noaa.gov/','https://www.nps.gov/'],terms:['nature','wildlife','landscape']},
 architecture:{name:'Cities & architecture',sites:['https://www.loc.gov/','https://www.nyc.gov/'],terms:['architecture','city','building']}
};
const categoryQueries={
 Text:'mediatype:texts',
 Diagrams:'(mediatype:image OR mediatype:texts) AND (diagram OR schematic OR blueprint OR chart)',
 Photos:'mediatype:image AND (photograph OR photography OR photo OR negative)',
 Maps:'(mediatype:image OR mediatype:texts) AND (map OR atlas OR cartography)',
 Posters:'(mediatype:image OR mediatype:texts) AND (poster OR advertisement OR lithograph)',
 Covers:'(mediatype:audio OR mediatype:movies OR mediatype:software)',
 Videos:'mediatype:movies'
};
async function* pages(params){
 const mode=params.get('source'),sources=[];
 const media=params.get('media')||(params.get('video')==='1'?'both':'photos');
 const photos=media!=='videos',videos=media!=='photos';
 function add(source,options,weight){
   const query=new URLSearchParams(params);
   query.set('source',source);for(const [key,value] of Object.entries(options))query.set(key,value);
   sources.push({query,weight,more:true,page:0,offered:0,previous:null,items:[]});
 }
 if(mode==='ia'||mode==='blended'){
   const categories=photos?Object.keys(categoryQueries).filter(k=>k!=='Videos'&&+params.get(k)>0):[];
   if(!categories.length&&mode==='ia'&&!videos)throw Error('Raise at least one image type weight.');
   if(videos)add('ia',{category:'Videos'},1);
   const total=categories.reduce((sum,k)=>sum+Number(params.get(k)),0);
   for(const k of categories)add('ia',{category:k},Number(params.get(k))/total);
 }
 function addWayback(site,weight){
   if(videos)add('wayback',{site,category:'Videos'},weight);
   if(photos)add('wayback',{site},weight);
 }
 if(mode==='wayback-site')addWayback(params.get('site'),1);
 if(mode==='blended'||mode==='wayback'){
   const sites=(GENRES[params.get('genre')]||GENRES.ephemera).sites;
   for(const site of sites)addWayback(site,1/sites.length);
 }
 const dates=dateWindow(params.get('date'),params.get('window'));
 let previewed=false;
 while(sources.some(s=>s.more||s.items.length)){
   const pending=sources.filter(s=>s.more&&!s.items.length);
   let issue='';
   const reads=pending.map(async s=>{
     try{
       const batch=await searchSource(s.query,++s.page);
       const fingerprint=batch.assets.map(a=>a.image).join('\n');
       if(fingerprint&&s.previous===fingerprint){s.more=false;return;}
       s.previous=fingerprint;s.more=batch.more;s.items=batch.assets;
     }catch(e){s.more=false;issue=e.message||'A source could not be reached.';}
     return s;
   });
   if(!previewed&&reads.length>1){
     const first=await Promise.any(reads.map(async read=>{
       const source=await read;
       if(source?.items.length)return source;
       throw Error('No candidates in this page.');
     })).catch(()=>null);
     if(first){
       previewed=true;first.offered++;
       yield {items:[first.items.shift()],dates};
     }
   }
   await Promise.all(reads);
   const items=[];
   while(items.length<24){
     const pool=sources.filter(s=>s.items.length||s.more).sort((a,b)=>(a.offered+.5)/a.weight-(b.offered+.5)/b.weight)[0];
     if(!pool||!pool.items.length)break;
     items.push(pool.items.shift());pool.offered++;
   }
   yield {items,issue,dates};
 }
}
return pages;})();

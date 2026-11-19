const peerTubeHosts=['video.blender.org','peertube.tv','tilvids.com','fedi.video','diode.zone','makertube.net','video.hardlimit.com'];
async function* videoCatalogPages(search,queries){
 for(const terms of queries)yield* search(terms);
}
async function* archiveVideoCatalogPages(terms){
 const words=(terms.match(/[\p{L}\p{N}]+/gu)||[]).map(word=>'"'+word+'"');
 const search='mediatype:movies'+(words.length?' AND ('+words.join(' AND ')+')':'');
 for(let page=1;;page++){
   const params=new URLSearchParams({q:search,output:'json',rows:'24',page:String(page),'sort[]':'downloads desc'});
   for(const name of ['identifier','title','date'])params.append('fl[]',name);
   const data=await fieldJSON('https://archive.org/advancedsearch.php?'+params);
   const result=data.response;
   if(!Array.isArray(result?.docs))throw Error('Internet Archive video search unavailable.');
   yield {items:result.docs.filter(row=>row.identifier&&/^[\w.-]{1,200}$/.test(row.identifier)).map(row=>({
     kind:'video',source:'Internet Archive',title:row.title||row.identifier,date:String(row.date||'Undated').slice(0,10),
     link:'https://archive.org/details/'+row.identifier,image:'/archive-video?id='+encodeURIComponent(row.identifier)
   }))};
   if(!result.docs.length||page*24>=result.numFound)return;
 }
}
async function* nasaVideoPages(terms){
 const seen=new Set();
 for(let page=1;;page++){
   const query=new URLSearchParams({q:terms||'earth',media_type:'video',page_size:'24',page:String(page)});
   const data=await fieldJSON('https://images-api.nasa.gov/search?'+query);
   const rows=data.collection?.items||[];
   const items=[];
   for(const row of rows){
     const clip=row.data?.[0],id=clip?.nasa_id;
     if(!id||seen.has(id))continue;
     seen.add(id);
     items.push({kind:'video',source:'NASA',title:clip.title||id,date:(clip.date_created||'NASA library').slice(0,10),
       link:'https://images.nasa.gov/details/'+encodeURIComponent(id),image:'/nasa-video?id='+encodeURIComponent(id)});
   }
   if(!items.length)return;
   yield {items};
   if(rows.length<24)return;
 }
}
async function* peerTubeVideoPages(terms){
 const seen=new Set();
 for(let start=0;;start+=18){
   const query=new URLSearchParams({search:terms||'animation',count:'18',start:String(start),nsfw:'false'});
   const pages=await Promise.allSettled(peerTubeHosts.map(host=>fieldJSON('https://'+host+'/api/v1/search/videos?'+query,8500)));
   const groups=pages.map((page,index)=>({rows:page.value?.data||[],host:peerTubeHosts[index]}));
   const items=[];
   for(let row=0;row<18;row++)for(const group of groups){
     const clip=group.rows[row];
     if(!clip?.uuid||clip.isLive||seen.has(clip.uuid))continue;
     seen.add(clip.uuid);
     items.push({kind:'video',source:'PeerTube',title:clip.name||'PeerTube video',date:(clip.publishedAt||'Web search').slice(0,10),
       link:'https://'+group.host+'/w/'+(clip.shortUUID||clip.uuid),image:'/peertube-video?host='+group.host+'&id='+clip.uuid});
   }
   if(!items.length){
     if(pages.every(p=>p.status==='rejected'))throw Error('PeerTube hosts did not respond.');
     return;
   }
   yield {items};
   if(groups.every(group=>group.rows.length<18))return;
 }
}
async function resolveCatalogVideo(item){
 const u=new URL(item.image,location.origin),id=u.searchParams.get('id');
 if(!id||!/^[\w.-]{1,200}$/.test(id))throw Error('Invalid catalog video');
 let url;
 if(u.pathname==='/nasa-video'){
   const data=await fieldJSON('https://images-api.nasa.gov/asset/'+encodeURIComponent(id));
   const files=(data.collection?.items||[]).map(entry=>entry.href?.replace(/^http:/,'https:'))
     .filter(link=>link?.startsWith('https://images-assets.nasa.gov/')&&/\.mp4(?:$|\?)/i.test(link));
   url=files.find(link=>/~(?:mobile|small)\.mp4$/i.test(link))||files.find(link=>/~medium\.mp4$/i.test(link))||files[0];
 }else{
   const host=u.searchParams.get('host');
   if(!peerTubeHosts.includes(host))throw Error('Invalid PeerTube host');
   const data=await fieldJSON('https://'+host+'/api/v1/videos/'+encodeURIComponent(id));
   const files=[...(data.files||[]),...(data.streamingPlaylists||[]).flatMap(entry=>entry.files||[])]
     .filter(file=>file.hasVideo!==false&&file.resolution?.id!==0&&file.fileUrl?.startsWith('https://')&&/\.(mp4|webm)(?:$|\?)/i.test(file.fileUrl));
   files.sort((a,b)=>Math.abs((a.resolution?.id||480)-480)-Math.abs((b.resolution?.id||480)-480));
   url=files[0]?.fileUrl;
 }
 if(!url)throw Error('No compatible video rendition');
 return {...item,image:remoteVideo(new URL(url).href)};
}

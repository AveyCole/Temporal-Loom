const mediaModes={photos:'photos',videos:'videos',both:'photos and videos'};
const mediaMode=()=>$('mediaMode').value;
function setMediaMode(media,legacyVideo){
 const mode=Object.hasOwn(mediaModes,media)?media:legacyVideo?'both':'photos';
 $('mediaMode').value=mode;
 localStorage.setItem('mediaMode',mode);
}
function initMediaMode(){
 setMediaMode(localStorage.getItem('mediaMode'),localStorage.getItem('videoMode')==='1');
 $('mediaMode').onchange=()=>setMediaMode(mediaMode());
 initAbstractSearch();
}
function mediaMatches(item,mode){
 return mode==='both'||(mode==='videos'?item.kind==='video':item.kind!=='video');
}
function remoteVideo(url){return '/web-video?url='+encodeURIComponent(url);}
async function resolveVideo(item){
 const id=new URL(item.image,location.origin).searchParams.get('id');
 if(!id||!/^[\w.-]{1,200}$/.test(id))throw Error('Invalid archive video');
 const data=await fieldJSON('https://archive.org/metadata/'+encodeURIComponent(id));
 const files=(data.files||[]).filter(file=>/\.(mp4|webm)$/i.test(file.name)&&+file.size>0&&+file.size<250*1024*1024);
 const rank=file=>Number(/\.webm$/i.test(file.name))+Number(+file.size>45000000)*2;
 files.sort((a,b)=>rank(a)-rank(b)||Number(a.size)-Number(b.size));
 if(!files.length)throw Error('No compatible video file');
 const file=files[0].name.split('/').map(encodeURIComponent).join('/');
 return {...item,image:remoteVideo('https://archive.org/download/'+encodeURIComponent(id)+'/'+file)};
}
function commonsClip(page,date){
 const info=page.videoinfo?.[0];
 const compatible=url=>url?.startsWith('https://upload.wikimedia.org/')&&/\.(webm|mp4)(?:\?|$)/i.test(url);
 if(!info?.descriptionurl?.startsWith('https://commons.wikimedia.org/'))return null;
 const options=(info.derivatives||[]).filter(file=>compatible(file.src)&&Number.isFinite(Number(file.height))&&Number(file.height)>0);
 options.sort((a,b)=>Math.abs(a.height-480)-Math.abs(b.height-480));
 const url=options[0]?.src||(compatible(info.url)?info.url:null);
 if(!url)return null;
 return {title:page.title.replace(/^File:/,''),source:'Wikimedia Commons',date,link:info.descriptionurl,kind:'video',image:remoteVideo(url)};
}
async function* commonsVideoPages(terms){
 let cursor={},previous='';
 do{
   const params=new URLSearchParams({action:'query',format:'json',generator:'search',gsrsearch:(terms||'animation')+' filetype:video',gsrnamespace:'6',gsrlimit:'24',prop:'videoinfo',viprop:'url|derivatives',...cursor});
   const data=await fieldJSON('https://commons.wikimedia.org/w/api.php?'+params);
   if(data.error)throw Error(data.error.info||'Commons video search unavailable.');
   yield {items:Object.values(data.query?.pages||{}).map(page=>commonsClip(page,'Web search')).filter(Boolean)};
   previous=JSON.stringify(cursor);cursor=data.continue;
 }while(cursor&&JSON.stringify(cursor)!==previous);
}
function validVideoReference(item){
 if(item.kind!=='video'||typeof item.title!=='string'||typeof item.date!=='string'||!item.image?.startsWith('/web-video?'))return false;
 try{
   const media=new URL(new URL(item.image,location.origin).searchParams.get('url')),source=new URL(item.link);
   return media.protocol==='https:'&&source.protocol==='https:'&&!media.username&&!media.password
     &&['Website','Internet Archive','Wayback','Wikimedia Commons','NASA','PeerTube'].includes(item.source);
 }catch{return false;}
}

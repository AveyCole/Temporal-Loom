const fs=require('node:fs'),path=require('node:path'),http=require('node:http');
const {parseHTML}=require('linkedom');
const mime={'.html':'text/html','.js':'text/javascript','.json':'application/json','.woff2':'font/woff2','.ttf':'font/ttf','.png':'image/png','.jpg':'image/jpeg','.jpeg':'image/jpeg','.webp':'image/webp','.gif':'image/gif','.avif':'image/avif','.svg':'image/svg+xml','.mp4':'video/mp4','.mov':'video/quicktime','.m4v':'video/mp4','.webm':'video/webm','.m4a':'audio/mp4','.mp3':'audio/mpeg','.wav':'audio/wav','.ogg':'audio/ogg','.opus':'audio/ogg'};
const LIMIT=512*1024*1024,CHUNK=4*1024*1024;
function contentType(file){return mime[path.extname(file).toLowerCase()]||'application/octet-stream';}
function rangeFor(header,size){
 if(!header)return null;const match=/^bytes=(\d*)-(\d*)$/.exec(header);if(!match||(!match[1]&&!match[2]))return false;
 let start=match[1]?Number(match[1]):Math.max(0,size-Number(match[2]));let end=match[1]?(match[2]?Number(match[2]):size-1):size-1;
 if(!Number.isSafeInteger(start)||!Number.isSafeInteger(end)||start>=size||end<start)return false;
 return {start,end:Math.min(end,size-1,start+CHUNK-1)};
}
function sendFile(req,res,file,type=contentType(file)){
 const size=fs.statSync(file).size,range=rangeFor(req.headers.range,size);
 if(range===false){res.writeHead(416,{'Content-Range':'bytes */'+size});res.end();return;}
 const {start,end}=range||{start:0,end:size-1};
 res.writeHead(range?206:200,{'Content-Type':type,'Content-Length':Math.max(0,end-start+1),'Accept-Ranges':'bytes',...(range?{'Content-Range':`bytes ${start}-${end}/${size}`}:{})});
 if(req.method==='HEAD'||!size){res.end();return;}const stream=fs.createReadStream(file,{start,end});res.on('close',()=>stream.destroy());stream.on('error',()=>res.destroy());stream.pipe(res);
}
function publicURL(value){const u=new URL(value);if(!['https:','http:'].includes(u.protocol)||u.username||u.password||u.hostname==='localhost'||u.hostname.endsWith('.local')||/^(?:127\.|10\.|192\.168\.|169\.254\.|172\.(?:1[6-9]|2\d|3[01])\.)/.test(u.hostname)||u.hostname.includes(':')||/^0\./.test(u.hostname))throw Error('Use a public HTTP or HTTPS media address.');return u;}
async function publicFetch(url,options={},fetcher=fetch){
 let u=publicURL(url);for(let n=0;n<6;n++){const r=await fetcher(u,{...options,redirect:'manual'});if([301,302,303,307,308].includes(r.status)){await r.body?.cancel();u=publicURL(new URL(r.headers.get('location'),u));continue;}return r;}throw Error('Too many media redirects.');
}
async function boundedBuffer(response,limit){
 if(!response.ok)throw Error('Media provider returned '+response.status);
 if(Number(response.headers.get('content-length'))>limit){await response.body?.cancel();throw Error('Media exceeds its size limit.');}
 const parts=[];let size=0;for await(const part of response.body){size+=part.length;if(size>limit)throw Error('Media exceeds its size limit.');parts.push(part);}return Buffer.concat(parts,size);
}
function websiteItems(html,base,media='both'){
 const {document}=parseHTML(html),seen=new Set(),items=[];
 const add=(value,title='Website media',kind)=>{try{const url=publicURL(new URL(value,base));kind=kind||(/\.(mp4|webm|mov|m4v)(?:$|\?)/i.test(url.href)?'video':'image');if((media==='photos'&&kind==='video')||(media==='videos'&&kind!=='video')||seen.has(url.href))return;seen.add(url.href);items.push({title:title.slice(0,250),date:'Live website',source:'Website',kind,link:url.href,image:(kind==='video'?'/web-video?url=':'/web-image?url=')+encodeURIComponent(url.href)});}catch{}};
 for(const meta of document.querySelectorAll('meta[property="og:image"],meta[name="twitter:image"]'))add(meta.getAttribute('content'));
 for(const img of document.querySelectorAll('img')){const src=img.getAttribute('src')||img.getAttribute('data-src')||img.getAttribute('data-original');if(src)add(src,img.getAttribute('alt')||'Website image','image');const set=img.getAttribute('srcset');if(set)add(set.split(',').pop().trim().split(/\s+/)[0],img.getAttribute('alt')||'Website image','image');}
 for(const node of document.querySelectorAll('video,video source,meta[property="og:video"],meta[property="og:video:url"],meta[property="og:video:secure_url"]'))add(node.getAttribute('src')||node.getAttribute('content'),'Website video','video');
 for(const link of document.querySelectorAll('a[href]')){const href=link.getAttribute('href');if(/\.(png|jpe?g|webp|gif|avif|mp4|webm|mov|m4v)(?:$|\?)/i.test(href))add(href,link.textContent.trim()||'Website media');}
 return items.slice(0,512);
}
function listFolder(directory,media,files){
 const found=[],pending=[directory];let visited=0;
 while(pending.length&&found.length<512&&visited<20000){const dir=pending.pop();let entries;try{entries=fs.readdirSync(dir,{withFileTypes:true});}catch{continue;}
 for(const entry of entries){visited++;const file=path.join(dir,entry.name);if(entry.isDirectory()&&!entry.name.startsWith('.')){pending.push(file);continue;}if(!entry.isFile())continue;const type=contentType(file),video=type.startsWith('video/'),image=type.startsWith('image/');if(!(video||image)||(media==='photos'&&video)||(media==='videos'&&image))continue;
 const id=require('node:crypto').randomUUID();files.set(id,file);found.push({title:entry.name,date:'Local file',source:'Local file',kind:video?'video':'image',image:'/folder/'+id});if(found.length>=512)break;}}
 return found;
}
function createMediaServer({root,worker,files=new Map(),decoded=new Map(),thumbs=new Map(),fetcher=fetch}){
 const server=http.createServer(async(req,res)=>{try{
 const u=new URL(req.url,'http://127.0.0.1');
 if(!['GET','HEAD'].includes(req.method)){res.writeHead(405);res.end();return;}
 if(u.pathname.startsWith('/folder/')){const f=files.get(u.pathname.slice(8));if(!f)throw Error('File unavailable');sendFile(req,res,f);return;}
 if(u.pathname.startsWith('/decoded-audio/')){const f=decoded.get(u.pathname);if(!f)throw Error('Audio unavailable');sendFile(req,res,f);return;}
 if(u.pathname.startsWith('/google-thumb/')){const thumb=thumbs.get(u.pathname);if(!thumb)throw Error('Thumbnail unavailable');res.writeHead(200,{'Content-Type':thumb.type,'Content-Length':thumb.bytes.length});res.end(thumb.bytes);return;}
 if(u.pathname==='/website'){
  const site=publicURL(u.searchParams.get('url')),r=await publicFetch(site,{signal:AbortSignal.timeout(25000)},fetcher),type=r.headers.get('content-type')||'',media=u.searchParams.get('media')||'both';
  let items;if(type.startsWith('image/')||type.startsWith('video/')){await r.body?.cancel();items=websiteItems(`<${type.startsWith('video/')?'video':'img'} src="${site.href.replaceAll('&','&amp;').replaceAll('"','&quot;')}">`,site,media);}else items=websiteItems((await boundedBuffer(r,4*1024*1024)).toString('utf8'),site,media);
  res.writeHead(200,{'Content-Type':'application/json'});res.end(JSON.stringify(items));return;
 }
 if(['/relay','/web-image','/web-video','/web-audio','/field-audio'].includes(u.pathname)){
  const media=['/web-video','/web-audio','/field-audio'].includes(u.pathname),headers={};if(media){const match=/^bytes=(\d*)-(\d*)$/.exec(req.headers.range||`bytes=0-${CHUNK-1}`);if(!match||(!match[1]&&!match[2]))throw Error('Invalid media range.');if(match[1]){const start=Number(match[1]),end=match[2]?Number(match[2]):Number.MAX_SAFE_INTEGER;if(!Number.isSafeInteger(start)||!Number.isSafeInteger(end)||end<start)throw Error('Invalid media range.');headers.Range=`bytes=${start}-${Math.min(end,start+CHUNK-1)}`;}else headers.Range='bytes=-'+Math.min(Number(match[2]),CHUNK);}
  const r=await publicFetch(u.searchParams.get('url'),{headers,signal:AbortSignal.timeout(media?90000:25000)},fetcher);
  const total=Number(/\/(\d+)$/.exec(r.headers.get('content-range')||'')?.[1]||r.headers.get('content-length'));
  if(media&&total>LIMIT){await r.body?.cancel();throw Error('Online media must be 512 MiB or smaller.');}
  if(media&&r.status===206){const span=/^bytes (\d+)-(\d+)\/(\d+)$/.exec(r.headers.get('content-range')||'');if(!span||Number(span[2])<Number(span[1])||Number(span[2])>=Number(span[3])||Number(span[2])-Number(span[1])>=CHUNK){await r.body?.cancel();throw Error('Invalid media response range.');}}
  const bytes=await boundedBuffer(r,media?CHUNK:(u.pathname==='/web-image'?24:8)*1024*1024);
  if(media&&r.status===206){const span=/^bytes (\d+)-(\d+)\/(\d+)$/.exec(r.headers.get('content-range'));if(bytes.length!==Number(span[2])-Number(span[1])+1)throw Error('Incomplete media response.');}
  const output={'Content-Type':r.headers.get('content-type')||'application/octet-stream','Content-Length':bytes.length};for(const key of ['content-range','accept-ranges'])if(r.headers.has(key))output[key]=r.headers.get(key);
  res.writeHead(r.status,output);res.end(bytes);return;
 }
 const pathname=u.pathname==='/display'?'/display.html':u.pathname==='/'?'/index.html':u.pathname;
 const file=path.resolve(root,'.'+decodeURIComponent(pathname));if(file.startsWith(root+path.sep)&&fs.existsSync(file)&&fs.statSync(file).isFile()){sendFile(req,res,file);return;}
 const r=await worker.fetch(new Request('http://127.0.0.1'+req.url));res.writeHead(r.status,Object.fromEntries(r.headers));res.end(Buffer.from(await r.arrayBuffer()));
 }catch(e){if(!res.headersSent)res.writeHead(502,{'Content-Type':'application/json'});res.end(JSON.stringify({error:e.message}));}});
 return server;
}
module.exports={createMediaServer,rangeFor,websiteItems,listFolder,boundedBuffer,contentType,publicURL};

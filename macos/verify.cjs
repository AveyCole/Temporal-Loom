const {test}=require('node:test');
const assert=require('node:assert/strict');
const fs=require('node:fs'),os=require('node:os'),path=require('node:path');
const {createMediaServer,rangeFor,websiteItems,listFolder,boundedBuffer}=require('./media-server.cjs');
const {runFFmpeg,toMP4,decodeAudio}=require('./ffmpeg.cjs');
test('media byte ranges support seeking, suffix ranges, caps, and invalid requests',()=>{
 assert.deepEqual(rangeFor('bytes=2-5',10),{start:2,end:5});assert.deepEqual(rangeFor('bytes=-3',10),{start:7,end:9});assert.deepEqual(rangeFor('bytes=5-',10),{start:5,end:9});assert.equal(rangeFor('bytes=10-',10),false);assert.equal(rangeFor('bytes=5-2',10),false);assert.equal(rangeFor('bytes=0-1,3-4',10),false);assert.equal(rangeFor('bytes=0-',20e6).end,4*1024*1024-1);
});
test('website gathering returns media with usable session references and respects media mode',()=>{
 const html='<meta property="og:image" content="/cover.jpg"><img data-src="/lazy.webp"><video src="/clip.mp4"></video><a href="/linked.webm">Clip</a>';
 const items=websiteItems(html,'https://example.com/page','both');assert.equal(items.length,4);assert.equal(websiteItems(html,'https://example.com','photos').length,2);assert.equal(websiteItems(html,'https://example.com','videos').length,2);assert(items.every(x=>new URL(x.image,'http://local').searchParams.get('url')===x.link));
});
test('folder search recurses, filters media, and skips symlinks',()=>{
 const dir=fs.mkdtempSync(path.join(os.tmpdir(),'loom-folder-test-'));try{fs.mkdirSync(path.join(dir,'sub'));fs.writeFileSync(path.join(dir,'sub','movie.mp4'),'video');fs.writeFileSync(path.join(dir,'photo.jpg'),'image');fs.symlinkSync(dir,path.join(dir,'loop'));const files=new Map();assert.equal(listFolder(dir,'both',files).length,2);assert.equal(listFolder(dir,'videos',files).length,1);assert.equal(listFolder(dir,'photos',files).length,1);}finally{fs.rmSync(dir,{recursive:true,force:true});}
});
test('provider body limits apply even without Content-Length',async()=>{await assert.rejects(()=>boundedBuffer(new Response('123456789'),4),/size limit/);await assert.rejects(()=>boundedBuffer(new Response('data',{headers:{'content-length':'100'}}),4),/size limit/);});
test('server returns website arrays, correct local ranges, companion audio and display page',async()=>{
 const dir=fs.mkdtempSync(path.join(os.tmpdir(),'loom-server-test-'));fs.writeFileSync(path.join(dir,'index.html'),'main');fs.writeFileSync(path.join(dir,'display.html'),'display');const media=path.join(dir,'clip.mp4');fs.writeFileSync(media,'0123456789');let fetched;
 const server=createMediaServer({root:dir,worker:{fetch:async()=>new Response('missing',{status:404})},files:new Map([['fixture',media]]),fetcher:async(u,options)=>{fetched={url:String(u),options};return String(u).includes('/page')?new Response('<img src="/photo.jpg"><video src="/clip.mp4"></video>',{headers:{'content-type':'text/html'}}):new Response('2345',{status:206,headers:{'content-range':'bytes 2-5/10','content-type':'audio/mp4','accept-ranges':'bytes'}});}});
 await new Promise(r=>server.listen(0,'127.0.0.1',r));const base='http://127.0.0.1:'+server.address().port;
 try{let r=await fetch(base+'/folder/fixture',{headers:{Range:'bytes=2-5'}});assert.equal(r.status,206);assert.equal(r.headers.get('content-range'),'bytes 2-5/10');assert.equal(await r.text(),'2345');r=await fetch(base+'/folder/fixture',{headers:{Range:'bytes=99-'}});assert.equal(r.status,416);assert.equal(await(await fetch(base+'/display')).text(),'display');const items=await(await fetch(base+'/website?url=https://example.com/page&media=photos')).json();assert(Array.isArray(items));assert.equal(items.length,1);r=await fetch(base+'/web-audio?url=https://example.com/audio.m4a',{headers:{Range:'bytes=2-5'}});assert.equal(r.status,206);assert.equal(await r.text(),'2345');assert.equal(fetched.options.headers.Range,'bytes=2-5');}finally{await new Promise(r=>server.close(r));fs.rmSync(dir,{recursive:true,force:true});}
});
test('desktop page contains current fragment deck and all native integration points',()=>{
 const html=fs.readFileSync(path.join(__dirname,'assets/index.html'),'utf8');for(const m of html.matchAll(/<script>([\s\S]*?)<\/script>/g))new Function(m[1]);
 for(const token of ['detachDisplay','captureWindow','micDevice','decodeVideoAudio','releaseVideoAudio','playLoadedAudio','reconcileFragmentDeck','progressiveDeck','googleSearch','/web-audio?','cameraStill','cameraLive','cameraRecord','tempoBpm','organicVariant'])assert(html.includes(token),token);
 assert(!html.includes('window.chrome.webview'));assert(!html.includes('hostObjects'));assert(!html.includes('ASIO settings'));
});
test('bundled FFmpeg converts video to MP4 and decodes a local soundtrack',async()=>{
 const dir=fs.mkdtempSync(path.join(os.tmpdir(),'loom-codec-test-'));try{const source=path.join(dir,'source.mkv'),output=path.join(dir,'output.mp4'),audio=path.join(dir,'audio.m4a');await runFFmpeg(['-f','lavfi','-i','color=c=green:s=640x360:r=10:d=0.5','-f','lavfi','-i','sine=frequency=440:duration=0.5','-c:v','ffv1','-c:a','pcm_s16le','-shortest','-y',source]);await toMP4(source,output);await decodeAudio(source,audio);assert(fs.readFileSync(output).includes(Buffer.from('ftyp')));assert(fs.statSync(audio).size>1000);await runFFmpeg(['-i',output,'-f','null','-']);}finally{fs.rmSync(dir,{recursive:true,force:true});}
});

test('MIDI messages use the selected real device ID and rebind when inputs change',async()=>{
 const vm=require('node:vm');const elements=new Map();
 class Select {constructor(){this.options=[];this.value='';this.listeners={};}replaceChildren(...options){this.options=options;this.value=options[0]?.value||'';}add(option){this.options.push(option);}addEventListener(type,fn){this.listeners[type]=fn;}}
 const element=id=>{if(!elements.has(id))elements.set(id,new Select());return elements.get(id);};
 const first={id:'keyboard-a',name:'Keyboard A',state:'connected'},second={id:'keyboard-b',name:'Keyboard B',state:'connected'};
 const access={inputs:new Map([[first.id,first],[second.id,second]])};const events=[];element('driver').onchange=()=>{};
 const context=vm.createContext({window:{loom:{send(){},call(){},decodeVideoAudio(){}},addEventListener(){}},document:{getElementById:element},navigator:{mediaDevices:{enumerateDevices:async()=>[],addEventListener(){}},requestMIDIAccess:async()=>access},localStorage:{getItem:()=>null,setItem(){}},Option:class {constructor(label,value){this.label=label;this.value=value;}},addEventListener(){},report(){},$:element,midiHeld:new Set(),midiMessage:(port,event)=>events.push({id:port.id,data:[...event.data]}),micState(){}});
 vm.runInContext(fs.readFileSync(path.join(__dirname,'bridge.js'),'utf8'),context);await vm.runInContext('Mic.midi()',context);
 first.onmidimessage({data:[144,60,100]});assert.equal(events[0].id,element('midiDevices').value);
 element('midiDevices').value=second.id;element('midiDevices').listeners.change();assert.equal(first.onmidimessage,null);second.onmidimessage({data:[176,1,64]});assert.deepEqual(events[1],{id:second.id,data:[176,1,64]});
});

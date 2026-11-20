import {integrateVideoEngine} from './video-engine.mjs';
import {finishPage} from './modes.mjs';
import fs from 'node:fs';
import worker from './web-template/worker.mjs';
let html=await (await worker.fetch(new Request('https://loom.local/'))).text();
html=html.replace('<script>', '<script src="/archive.js"></script><script>')
.replace(/<link[^>]+(?:manifest|icon)[^>]*>/g,'')
.replace('<button class="quiet" id="install">Install','<button hidden id="install">Install')
.replace(/<p>On Android, use Chrome[\s\S]*?<\/p>/,'')
.replace('<label for="genre">','<label for="words">Custom search words</label><input id="words" maxlength="160" placeholder="e.g. neon, night train, moon"><p class="note">Separate words or phrases with commas to build a deck from multiple searches. Leave empty to use the preset and genre.</p><details open><summary>Internet Archive image mix</summary><div id="weights"></div></details><label for="genre">')
.replace('<div class="control-grid">','<label for="effect">Morph style</label><select id="effect"><option>Scanlines</option><option>Kaleidoscope</option><option>Echo tunnel</option><option>Tidal ripple</option><option>Crossfade</option></select><div class="control-grid">')
.replace('<option value="audio">','<option value="mic">Live microphone</option><option value="audio">')
.replace('<label class="file-label">Load an audio file','<button id="micButton" class="wide">Mic off</button><label class="file-label">Load an audio file')
.replace("const response=await fetch('/api/search?'+query,{signal:AbortSignal.timeout(45000)});const data=await response.json();if(!response.ok)throw Error(data.error||'Archive search failed.');","query.set('words',$('words').value);for(const k of types)query.set(k,$(k).value);const data=await archiveSearch(query);")
.replace("if(analyser&&!$('audio').paused)", "if($('driver').value==='mic'){const amp=Mic.amplitude();const gain=.4+Number($('sensitivity').value)*3;energy=Math.max(amp*gain,energy*.86);avg=.96*avg+.04*amp;if(!frozen && amp>Math.max(.07,avg*1.45)/Math.sqrt(gain) && ms-lastBeat>380){lastBeat=ms;choose(b+1);}}else if(analyser&&!$('audio').paused)")
.replace("for(let y=0;y<h;y+=Math.ceil(h/36))",`const style=$('effect').value, power=warp*(.25+energy);
if(style==='Crossfade'){ctx.drawImage(img,(w-dw)/2,(h-dh)/2,dw,dh);return;}
if(style==='Echo tunnel'){for(let i=0;i<5;i++){const s=1-i*(.09+.04*power);ctx.save();ctx.translate(w/2,h/2);ctx.rotate(i*.035*Math.sin(t)*power);ctx.drawImage(img,-dw*s/2,-dh*s/2,dw*s,dh*s);ctx.restore();}return;}
if(style==='Kaleidoscope'){for(let i=0;i<4;i++){ctx.save();ctx.translate(i%2?w:0,i>1?h:0);ctx.scale(i%2?-1:1,i>1?-1:1);ctx.beginPath();ctx.rect(0,0,w/2,h/2);ctx.clip();ctx.translate(w/2,h/2);ctx.rotate(Math.sin(t*.4)*power);ctx.drawImage(img,-dw/2,-dh/2,dw,dh);ctx.restore();}return;}
for(let y=0;y<h;y+=Math.ceil(h/36))`)
.replace('ctx.drawImage(img,(w-dw)/2+sx,(h-dh)/2,dw,dh);','const stretch=style==="Tidal ripple"?1+.18*power*Math.sin(y/h*12-t*2):1;ctx.drawImage(img,(w-dw*stretch)/2+sx,(h-dh)/2,dw*stretch,dh);')
.replace("function download(blob,name){","async function download(blob,name){const reader=new FileReader();reader.onload=()=>Mic.save(name,reader.result.split(',')[1]);reader.readAsDataURL(blob);return;")
.replace("const session={version:1", "const session={mix:Object.fromEntries(types.map(k=>[k,$(k).value])),words:$('words').value,effect:$('effect').value,version:1")
.replace("selectPreset(data.preset);","selectPreset(data.preset);$('words').value=String(data.words||'').slice(0,160);$('effect').value=data.effect||'Scanlines';for(const k of types)$(k).value=data.mix?.[k]??50;")
.replace("selectPreset(preset);dimensions();",`const types=['Text','Diagrams','Photos','Maps','Posters','Covers'];
for(const k of types){const label=document.createElement('label');label.textContent=k;const input=document.createElement('input');input.id=k;input.type='range';input.min=0;input.max=100;input.value=50;label.append(input);$('weights').append(label);}
function micState(label){$('micButton').textContent=label;if(label==='Mic on'){$('driver').value='mic';manual=false;}else if($('driver').value==='mic')$('driver').value='drift';$('driverLabel').textContent=$('driver').selectedOptions[0].text.toUpperCase();}
$('micButton').onclick=()=>Mic.toggle();
const changeDriver=$('driver').onchange;$('driver').onchange=()=>{changeDriver();if($('driver').value==='mic' && $('micButton').textContent!=='Mic on' || $('driver').value!=='mic' && $('micButton').textContent==='Mic on')Mic.toggle();};
$('fullscreen').onclick=()=>{const el=$('stageWrap');el.classList.toggle('expanded');$('fullscreen').textContent=el.classList.contains('expanded')?'Exit':'Fullscreen';};
selectPreset(preset);dimensions();`)
.replace('</style>','.stage-wrap.expanded{position:fixed;inset:0;width:100%;height:100%;max-height:none;z-index:999}#weights{display:grid;grid-template-columns:1fr 1fr;gap:4px 16px}</style>');
html=html.replace('selectPreset(preset);dimensions();',`function nativeMidiReady(){const el=$('midiDevices');el.replaceChildren(new Option('Android MIDI','native'));midiHeld.clear();$('driver').value='midi';$('driver').onchange();report('MIDI connected. Notes select fragments, CC1 blends and CC74 warps.');}
function nativeNote(s,n,v){midiMessage({id:'native'},{data:[s,n,v]});}
$('connectMidi').onclick=()=>Mic.midi();
$('midiNote').textContent='Connect an Android MIDI input. Notes select fragments, CC1 blends and CC74 warps.';
selectPreset(preset);dimensions();`);
html=html.replace('<div class="control-grid">','<div id="rack"></div><div class="control-grid">')
.replace("function frame(ms){",()=>fs.readFileSync('rack.js','utf8')+"\nconst rack=installRack($('rack'));\nfunction frame(ms){")
.replace("if(!frozen){const driver=", "if(!frozen){const motionTime=rack.advance(delta);const driver=")
.replace("delta*.075","delta*.075*rack.state.morphRate")
.replace("delta*(.35+energy*1.4)","delta*(.35+energy*1.4)*rack.state.morphRate")
.replaceAll("ms/1000);","motionTime);")
.replace("canvas.width,1);ctx.globalAlpha=1;}","canvas.width,1);ctx.globalAlpha=1;rack.process(ctx,images,delta);}")
.replace("const session={mix:", "const session={rack:rack.save(),mix:")
.replace("selectPreset(data.preset);","selectPreset(data.preset);rack.restore(data.rack);");
html=html.replace('<div class="stage-top">','<button type="button" id="overlayToggle" aria-label="Hide playback text" aria-pressed="false"><svg viewBox="0 0 24 24" width="19" height="19" fill="none" stroke="currentColor" stroke-width="1.6" aria-hidden="true"><path d="M2 12Q12 -2 22 12Q12 26 2 12Z"/><circle cx="12" cy="12" r="3"/><path class="slash" d="M3 3L21 21"/></svg></button><div class="stage-top">')
.replace('</style>', '.stage-wrap.clean .stage-top,.stage-wrap.clean .stage-bottom{visibility:hidden}#overlayToggle{position:absolute;right:8px;top:50%;transform:translateY(-50%);z-index:4;width:44px;height:44px;display:grid;place-items:center;background:#101817aa;color:#eee;border:0;border-radius:50%}#overlayToggle .slash{display:none}.clean #overlayToggle .slash{display:block}.clean #overlayToggle{display:none}</style>')
.replace("d.fillText('SYNTHETIC FIELD", "if(!document.documentElement.classList.contains('stage-fullscreen')&&!document.getElementById('stageWrap').classList.contains('clean'))d.fillText('SYNTHETIC FIELD")
.replace("const rack=installRack", `function playbackText(hidden){$('stageWrap').classList.toggle('clean',hidden);demos=[demo(0),demo(1),demo(2)];$('overlayToggle').setAttribute('aria-pressed',String(hidden));$('overlayToggle').setAttribute('aria-label',hidden?'Show playback text':'Hide playback text');}
function setPlaybackHidden(hidden){playbackText(hidden);localStorage.setItem('hidePlaybackText',hidden?'1':'0');}
playbackText(localStorage.getItem('hidePlaybackText')==='1');
$('overlayToggle').onclick=event=>{event.stopPropagation();setPlaybackHidden(true);};
$('stageWrap').addEventListener('click',()=>{const stage=$('stageWrap');if(!stage.classList.contains('expanded')&&stage.classList.contains('clean'))setPlaybackHidden(false);});
const rack=installRack`);
html=html.replace('async function loadImages',()=>fs.readFileSync('emblem.js','utf8')+'\nasync function loadImages')
.replace('if(img.naturalWidth>0)results','if(img.naturalWidth>0 && (item.source==="Local file" || !isArchiveEmblem(img)))results')
.replace('Search found records, but their images were unavailable.', 'No usable images remained after checking for unavailable images and archive logos.')
.replace(/function frame\(ms\)\{([\s\S]*?lastFrame=ms;)[\s\S]*?energy=Math.min\(1,energy\);/,(_,clock)=>fs.readFileSync('audio-response.js','utf8')+'\n'+fs.readFileSync('motion.js','utf8')+'\nfunction frame(ms){'+clock+`
 const driver=$('driver').value,reactive=driver==='audio'||driver==='mic',motion=readDriver(driver,delta);
 if(reactive)energy=Math.min(1,motion.level+motion.pulse*.35);else energy*=.94;
 const motionDelta=delta*motion.speed;
 `)
.replace('rack.advance(delta);const driver=', 'rack.advance(motionDelta);const driver=')
.replace("if(driver==='drift'){morph+=delta*.075*rack.state.morphRate;", "if(driver==='drift'||reactive){morph+=motionDelta*(reactive?.32:.075)*rack.state.morphRate;")
.replace('rack.process(ctx,images,delta);','rack.process(ctx,images,delta,motion);');
html=html.replace(/(<option value="wayback-site">[^<]*<\/option>)/,'$1<option value="website">Live website</option><option value="folder">Local folder</option>')
.replace('selectPreset(preset);dimensions();requestAnimationFrame(frame);',match=>fs.readFileSync('sources.js','utf8')+'\n'+match)
.replaceAll("site:$('source').value==='wayback-site'?", "site:['website','wayback-site'].includes($('source').value)?")
.replace("['blended','ia','wayback','wayback-site'].includes(data.source)","['blended','ia','wayback','wayback-site','website','folder'].includes(data.source)")
.replace("for(const item of data.assets){if(typeof item.image", "for(const item of data.assets){if(validLiveReference(item))continue;if(typeof item.image")
.replace("?'LOCAL / ARCHIVE COLLAGE':'ARCHIVED MATERIAL'", "?'LOCAL IMAGES':assets.some(x=>x.source==='Website')?'LIVE WEBSITE':'ARCHIVED MATERIAL'");
html=html.replace('<div class="stage-wrap" id="stageWrap">','<div class="file-transport" role="group" aria-label="Audio file playback"><button type="button" id="playFile" disabled>Play</button><button type="button" id="stopFile" disabled>Stop</button><label><input type="checkbox" id="loopFile"> Loop audio</label></div><div class="stage-wrap" id="stageWrap">')
.replace('</style>','.file-transport{display:flex;align-items:center;flex-wrap:wrap;gap:8px;margin:0 0 10px}.file-transport label{display:inline-flex;align-items:center;gap:7px;margin:0;padding:8px}.file-transport input{width:auto;margin:0;accent-color:var(--mint)}.file-transport button:disabled{opacity:.45}</style>')
.replace('selectPreset(preset);dimensions();requestAnimationFrame(frame);',match=>fs.readFileSync('transport.js','utf8')+'\n'+match);
html=html.replace('<label><input type="checkbox" id="loopFile">','<button type="button" id="recordClip" aria-pressed="false">Record</button><label><input type="checkbox" id="loopFile">')
.replace(' Loop audio</label></div>',' Loop audio</label><small id="clipStatus" role="status"></small></div>')
.replace('let audioContext,analyser','let clipAudio,audioContext,analyser')
.replace('analyser.connect(audioContext.destination);','analyser.connect(audioContext.destination);clipAudio=audioContext.createMediaStreamDestination();analyser.connect(clipAudio);')
.replace('selectPreset(preset);dimensions();requestAnimationFrame(frame);',match=>fs.readFileSync('recorder.js','utf8')+'\n'+match);
html=html.replace('</style>',()=>fs.readFileSync('knobs.css','utf8')+'</style>')
.replace('selectPreset(preset);dimensions();requestAnimationFrame(frame);',match=>fs.readFileSync('knobs.js','utf8')+'\n'+match);
html=finishPage(html,fs.readFileSync('viewfinder.js','utf8'));
html=html.replace('<label for="effect">','<div class="look-buttons"><button type="button" class="primary" id="scramble">Scramble</button><button id="shuffleFx">Shuffle FX</button><button id="defaultFx">Default</button><small>Hold a knob, then drag.</small></div><label for="effect">')
.replace('function drawCover(img,alpha,offset,t){','function drawCover(img,alpha,offset,t){if(drawTransition(document.getElementById("effect").value,img,alpha,offset,t))return;')
.replace("ctx.globalAlpha=.08;ctx.fillStyle='hsl('","if(!defaultLook){ctx.globalAlpha=.08;ctx.fillStyle='hsl('")
.replace('canvas.width,1);ctx.globalAlpha=1;rack.process','canvas.width,1);}ctx.globalAlpha=1;rack.process')
.replace('const session={rack:', 'const session={defaultLook,rack:')
.replace('rack.restore(data.rack);','markDefault(Boolean(data.defaultLook));rack.restore(data.rack);')
.replace('vf.pair={url:temp','if(!defaultLook)applyLook(false);vf.pair={url:temp')
.replace("$('assets').append(button);","const cell=document.createElement('div');cell.className='deck-cell';const del=document.createElement('button');del.className='remove-fragment';del.textContent='×';del.setAttribute('aria-label','Remove '+asset.title);del.onclick=()=>removeFragment(index);cell.append(button,del);$('assets').append(cell);")
.replace("updateOutputs();dimensions();requestAnimationFrame(frame);",()=>fs.readFileSync('looks.js','utf8')+'\ninitLooks();updateOutputs();dimensions();requestAnimationFrame(frame);')
.replace('</style>','.deck-cell{position:relative;flex:none}.remove-fragment{position:absolute;top:0;right:0;min-width:32px;height:32px;padding:0;background:#101817df;color:white}.look-buttons{display:flex;gap:6px;align-items:center;flex-wrap:wrap;margin-top:10px}.look-buttons small{color:var(--muted)}#defaultFx[aria-pressed=true]{color:var(--acid)}</style>');
html=html.replace('<small id="clipStatus"','<button id="shareClip" hidden>Share clip</button><small id="clipStatus"');
html=integrateVideoEngine(html);
html=html.replace('<div class="performance">','<div class="find-controls"><details><summary id="rangeLabel">Fragment count</summary><div class="count-inputs"><label>Minimum <input id="fragmentMin" type="number" min="1" max="48" step="1"></label><label>Maximum <input id="fragmentMax" type="number" min="1" max="48" step="1"></label></div><small>Each search picks a target between these values.</small></details><button id="cancelFind" type="button" hidden>Cancel search</button></div><div class="performance">')
.replace(/\$\('excavate'\)\.onclick=async\(\)=>\{[\s\S]*?\n\};/,()=>fs.readFileSync('fragment-range.js','utf8')+"\n$('excavate').onclick=gatherArchiveByCount;")
.replace('initLooks();updateOutputs();','initFragmentRange();initLooks();updateOutputs();')
.replace('const session={defaultLook,','const session={fragmentRange:readFragmentRange(),defaultLook,')
.replace('markDefault(Boolean(data.defaultLook));','if(data.fragmentRange)setFragmentRange(data.fragmentRange);markDefault(Boolean(data.defaultLook));')
.replace('data.assets.length>36','data.assets.length>MAX_FRAGMENTS')
.replace('file.size>1024*1024','file.size>8*1024*1024')
.replace('</style>','.find-controls{display:flex;align-items:flex-start;gap:8px;margin:6px 0}.find-controls details{flex:1}.count-inputs{display:flex;gap:8px}.count-inputs input{width:6em}</style>');
html=html.replace('Internet Archive + Wayback</option>','All sources · Archive, Wayback, Google Images &amp; Wikipedia</option><option value="google">Google Images</option><option value="wikipedia">Wikipedia</option>')
.replace('<div id="siteField"', '<button type="button" id="browseGoogle">Open Google Images</button><div id="siteField"')
.replace("['blended','ia','wayback','wayback-site','website','folder'].includes", "['blended','ia','wayback','wayback-site','website','folder','google','wikipedia'].includes")
.replace('if(validLiveReference(item)||validCommonsReference(item))','if(validSearchReference(item)||validLiveReference(item)||validCommonsReference(item))')
.replace('initFragmentRange();initLooks();',()=>fs.readFileSync('search-sources.js','utf8')+"\n$('browseGoogle').onclick=()=>Mic.browseGoogle($('words').value||$('genre').selectedOptions[0].text);initFragmentRange();initLooks();");
html=html.replace('<select id="genre">','<select id="genre"><option value="none">None · Any genre</option><option value="art">Art &amp; design</option><option value="people">People &amp; everyday life</option><option value="history">History &amp; documentary</option><option value="travel">Travel &amp; landscapes</option><option value="industry">Industry &amp; technology</option>')
.replace("['ephemera','broadcast','science','digital','nature','architecture'].includes(data.genre)?data.genre:'ephemera'","Array.from($('genre').options).some(o=>o.value===data.genre)?data.genre:'none'")
.replace('multiple accept="image/*"','multiple accept="image/*,video/*"')
.replace('Add your own images','Add photos or videos')
.replace(/\$\('images'\)\.onchange=async event=>[^\n]+/,()=>fs.readFileSync('local-media.js','utf8'));
html=html.replace('<option value="1825">± 5 years</option>',option=>option+[10,15,20,25,30].map(years=>`<option value="${years*365}">± ${years} years</option>`).join(''));
html=html.replace('</style>','html.stage-fullscreen,html.stage-fullscreen body{overflow:hidden;overscroll-behavior:none;scrollbar-width:none}html.stage-fullscreen::-webkit-scrollbar,html.stage-fullscreen body::-webkit-scrollbar{display:none}</style>');
html=html.replace('</style>',`
 .stage-fullscreen header,.stage-fullscreen nav,.stage-fullscreen aside,.stage-fullscreen .workspace>:not(.stage-wrap){visibility:hidden}
 .stage-wrap.expanded{background:#000}
 .stage-wrap.expanded .stage-top,.stage-wrap.expanded .stage-bottom p,.stage-wrap.expanded #overlayToggle{display:none}
 .stage-wrap.expanded:not(.show-fullscreen-controls){cursor:none}
 .stage-wrap.expanded:not(.show-fullscreen-controls) .stage-bottom{visibility:hidden}
 .stage-wrap.expanded.show-fullscreen-controls .stage-bottom{visibility:visible;justify-content:flex-end;background:none}
 </style>`);
html=html.replace('<label for="effect">','<button type="button" id="mutateMorph" title="Regenerate the organic shape">Mutate morph</button><label for="effect">')
 .replace('initFragmentRange();initLooks();',match=>fs.readFileSync('organic-variants.js','utf8')+'\n'+fs.readFileSync('organic.js','utf8')+'\n'+match)
 .replace('const session={fragmentRange:','const session={organicSeed,fragmentRange:')
 .replace('if(data.fragmentRange)setFragmentRange(data.fragmentRange);','if(Number.isFinite(data.organicSeed))organicSeed=data.organicSeed;if(data.fragmentRange)setFragmentRange(data.fragmentRange);')
 .replace("drawCover(images[a%images.length],1,0,motionTime);ctx.globalCompositeOperation='screen';drawCover(images[b%images.length],morph,2,motionTime);",`
 const organic=drawOrganicMorph(images[a%images.length],images[b%images.length],morph,motionTime,motion);
 if(!organic){drawCover(images[a%images.length],1,0,motionTime);ctx.globalCompositeOperation='screen';drawCover(images[b%images.length],morph,2,motionTime);}`)
 .replace('if(!defaultLook){ctx.globalAlpha=.08;','if(!defaultLook&&!organic){ctx.globalAlpha=.08;');
html=html.replace('<button id="cancelFind"','<label class="media-mode">Media to find <select id="mediaMode"><option value="photos">Photos</option><option value="videos">Videos</option><option value="both">Both</option></select></label><label id="abstractSearchControl" hidden><input type="checkbox" id="abstractSearch"> Abstract search</label><button id="cancelFind"')
 .replace('<p id="status"','<details id="searchTerms" hidden><summary>Search terms tried</summary><ol id="searchTermsList"></ol></details><p id="status"')
 .replaceAll('Excavate images','Excavate fragments')
 .replace('initFragmentRange();initLooks();',match=>fs.readFileSync('online-video.js','utf8')+'\n'+fs.readFileSync('abstract-search.js','utf8')+'\ninitMediaMode();'+match)
 .replace('const session={organicSeed,','const session={mediaMode:mediaMode(),abstractSearch:$("abstractSearch").checked,organicSeed,')
 .replace('({title,date,source,link,image})=>({title,date,source,link,image})','({title,date,source,link,image,kind})=>({title,date,source,link,image,kind})')
 .replace('if(validSearchReference(item)||','if(validVideoReference(item)||validSearchReference(item)||')
 .replace('if(Number.isFinite(data.organicSeed))','if(data.mediaMode||typeof data.videoMode==="boolean")setMediaMode(data.mediaMode,data.videoMode);if(typeof data.abstractSearch==="boolean")setAbstractSearch(data.abstractSearch);if(Number.isFinite(data.organicSeed))')
 .replace('</style>','.find-controls{flex-wrap:wrap}.find-controls .media-mode,#abstractSearchControl{display:flex;align-items:center;gap:6px;margin:0;white-space:nowrap}.media-mode select,#abstractSearchControl input{width:auto;margin:0}#abstractSearchControl[hidden],.viewfinding #abstractSearchControl,.viewfinding #searchTerms{display:none}#searchTerms li{padding:2px 0}</style>');
html=html.replace('function installRack(host){',match=>fs.readFileSync('extra-fx.js','utf8')+'\n'+match)
 .replace('<option value="google">Google Images</option>','<option value="google">Google Images</option><option value="nasa">NASA video library</option><option value="peertube">PeerTube videos</option><option value="commons-video">Wikimedia Commons videos</option><option value="ia-video">Internet Archive videos · any date</option>')
 .replace("'folder','google','wikipedia'].includes(data.source)", "'folder','google','wikipedia','nasa','peertube','commons-video','ia-video'].includes(data.source)")
 .replace('initMediaMode();initFragmentRange();',match=>fs.readFileSync('video-catalogs.js','utf8')+'\n'+match)
 .replace('<small>Each search picks a target between these values.</small>','<small>Each search picks a target between these values.</small><button id="resetFragmentRange" type="button">Reset to 10–50</button>');
html=html.replace('let clipAudio,audioContext','let clipAudio,audioMonitor,fileSource,audioContext')
 .replace("const source=audioContext.createMediaElementSource($('audio'));source.connect(analyser);analyser.connect(audioContext.destination);", "fileSource=audioContext.createMediaElementSource($('audio'));audioMonitor=audioContext.createGain();analyser.connect(audioMonitor);audioMonitor.connect(audioContext.destination);updateAudioGraph();")
 .replace('<input id="audioFile" type="file" accept="audio/*">','<input id="audioFile" type="file" accept="audio/*,video/*">')
 .replace('Load an audio file','Load audio or video sound')
 .replace("$('audio').src=audioURL;","discardFragmentAudio();rememberAudioFile(file);assignAudioMedia(audioURL);")
 .replace('<button type="button" id="stopFile" disabled>Stop</button>', '<button type="button" id="stopFile" disabled>Stop</button><button type="button" id="restoreFragmentAudio" hidden>Restore previous audio</button>')
 .replace('cell.append(button,del);',`cell.append(button,del);
   if(asset.kind==='video'){
     const use=document.createElement('button');use.type='button';use.className='use-fragment-audio';
     use.textContent='Use audio';use.setAttribute('aria-label','Use audio from '+asset.title);use.onclick=()=>useFragmentAudio(asset);
     cell.append(use);
   }`)
 .replace('const loopOption=',match=>fs.readFileSync('fragment-audio.js','utf8')+'\n'+match)
 .replace('</style>','.use-fragment-audio{display:block;width:100%;min-height:30px;margin-top:2px;font-size:11px;padding:3px 5px}</style>');
html=html.replace('<span id="topMic"></span>','<button type="button" id="typeTab" aria-pressed="false">Type</button><span id="topMic"></span>')
 .replace('<section class="workspace">',match=>match+fs.readFileSync('type-panel.html','utf8'))
 .replace('</style>',()=>fs.readFileSync('type-panel.css','utf8')+'</style><link id="typeFontCatalog" rel="stylesheet" href="/type-fonts/catalog.css">')
 .replace('initMediaMode();initFragmentRange();',match=>fs.readFileSync('type-fragments.js','utf8')+'\ninitType();'+match)
 .replace('const session={mediaMode:', 'const session={typeFonts:exportTypeFonts(),mediaMode:')
 .replace('({title,date,source,link,image,kind})=>({title,date,source,link,image,kind})',
   '({title,date,source,link,image,audio,kind,typeSpec})=>kind==="type"?{title,date,source,kind,typeSpec}:{title,date,source,link,image,audio,kind}')
 .replace('if(validVideoReference(item)||','if(validTypeReference(item)||validVideoReference(item)||')
 .replace('if(data.mediaMode||typeof data.videoMode==="boolean")','await restoreTypeFonts(data.typeFonts);if(data.mediaMode||typeof data.videoMode==="boolean")')
 .replace('cell.append(button,del);',`cell.append(button,del);
   if(asset.kind==='type'){
     const edit=document.createElement('button');edit.type='button';edit.className='use-fragment-audio';edit.textContent='Edit type';
     edit.setAttribute('aria-label','Edit type '+asset.title);edit.onclick=()=>editTypeFragment(asset);cell.append(edit);
   }`)
 .replace("$('stageOrigin').textContent=assets.some(", "$('stageOrigin').textContent=vf.active&&vf.pair?'VIEWFINDER':assets.some(")
 .replace("'ARCHIVED MATERIAL';if(!preserveStage", "(assets.length&&assets.every(x=>x.kind==='type')?'CUSTOM TYPE':'ARCHIVED MATERIAL');if(!preserveStage");
html=html.replace('<div class="eyebrow">FRAGMENT DECK</div>',
   '<div class="deck-heading"><div class="eyebrow">FRAGMENT DECK</div><button type="button" id="shuffleDeck" disabled>Shuffle deck</button></div>')
 .replace("button.onclick=()=>choose(index);const cell=", "button.onclick=()=>selectDeckFragment(index);const cell=")
 .replace("$('assets').append(cell);const source=", "cell.prepend(deckHandle(asset,cell));$('assets').append(cell);const source=")
 .replace('initMediaMode();initFragmentRange();',match=>fs.readFileSync('fragment-deck.js','utf8')+'\n'+match)
 .replace('</style>',`\n.deck-heading{display:flex;align-items:center;justify-content:space-between;gap:8px}
.deck-heading button:disabled{opacity:.45;cursor:default}
.deck-handle{position:absolute;z-index:1;top:0;left:0;width:34px;height:34px;padding:0;background:#101817df;color:var(--text);font-size:20px;cursor:grab;touch-action:none;user-select:none}
.deck-dragging{opacity:.55}.deck-dragging .deck-handle{cursor:grabbing}
.deck-cell[data-drop]::after{content:'';position:absolute;background:var(--acid);width:3px;top:0;bottom:0;pointer-events:none}
.deck-cell[data-drop="before"]::after{left:0}.deck-cell[data-drop="after"]::after{right:0}
</style>`);
html=html.replace('<button id="next">Next fragment</button>',`<button id="next">Next fragment</button>
 <details class="tempo-settings"><summary id="tempoSummary">Tempo sync</summary><div class="tempo-fields">
 <label><input type="checkbox" id="tempoSync"> Sync fragments to tempo</label>
 <label>BPM <input type="number" min="20" max="400" step="1" value="120" id="tempoBpm"></label>
 <label>Division <select id="tempoDivision">${['1/32','1/24','1/16','3/32','1/12','1/8','1/6','3/16','1/4','3/12','1/3','3/8','1/2','3/4','1/1','custom'].map(value=>`<option value="${value}">${value==='custom'?'Custom':value}</option>`).join('')}</select></label>
 <label id="tempoCustomField" hidden>Fraction <input id="tempoCustom" value="5/16" maxlength="7" placeholder="5/16"></label>
 </div></details>`)
 .replace('initMediaMode();initFragmentRange();',match=>fs.readFileSync('tempo.js','utf8')+'\ninitTempo();'+match)
 .replace('function choose(index){const n=', 'function choose(index){tempoClock.reset();const n=')
 .replace("frozen=!frozen;$('freeze')", "frozen=!frozen;if(frozen)tempoClock.pause(performance.now());$('freeze')")
 .replace('if(!frozen){const motionTime=', 'const tempoDriven=updateFragmentTempo(ms);if(!frozen){const motionTime=')
 .replace("if(!manual){if(driver==='drift'||reactive)", "if(!tempoDriven&&!manual){if(driver==='drift'||reactive)")
 .replace('if(!preserveStage&&!start){a=0;', 'if(!preserveStage&&!start){tempoClock.reset();a=0;')
 .replace('const session={typeFonts:', 'const session={tempo:tempoSettings,typeFonts:')
 .replace('await restoreTypeFonts(data.typeFonts);', 'await restoreTypeFonts(data.typeFonts);restoreTempo(data.tempo);')
 .replace('image,audio,kind,typeSpec})=>', 'image,audio,kind,typeSpec,videoStart})=>')
 .replace('{title,date,source,link,image,audio,kind}', '{title,date,source,link,image,audio,kind,videoStart}')
 .replace('cell.append(use);', 'cell.append(use);if(!asset.liveStream)cell.append(videoStartControl(asset));')
 .replace('</style>',`\n.tempo-settings{font-size:12px;flex:0 1 auto}.tempo-settings[open]{flex-basis:100%}
.tempo-fields{display:flex;align-items:center;gap:8px 14px;flex-wrap:wrap;padding:6px 0}
.tempo-fields label{display:flex;align-items:center;gap:6px;margin:0}.tempo-fields label[hidden]{display:none}
.tempo-fields input,.tempo-fields select{margin:0;width:auto}.tempo-fields input:not([type=checkbox]){width:5.5em}
.fragment-video-start{display:flex;flex-direction:column;gap:2px;margin:3px 0 0;font-size:10px}.fragment-video-start select{margin:0;padding:3px 4px;font-size:11px;min-height:29px}
</style>`);
html=html.replace('<option value="folder">Local folder</option>', '$&<option value="camera">Camera</option>')
 .replace("'ia-video'].includes(data.source)", "'ia-video','camera'].includes(data.source)")
 .replace('<p class="note" id="dateNote">',`<section id="cameraPanel" class="camera-capture" hidden aria-label="Camera capture">
 <label for="cameraDevice">Camera device</label><select id="cameraDevice"><option value="">Default camera</option></select>
 <video id="cameraPreview" aria-label="Camera preview" playsinline muted autoplay hidden></video>
 <div class="camera-actions"><button type="button" id="cameraStill" disabled>Add still</button><button type="button" id="cameraLive" disabled>Add live video</button><button type="button" id="cameraRecord" aria-pressed="false" disabled>Record camera clip</button></div>
 <small id="cameraStatus" role="status"></small>
 </section><p class="note" id="dateNote">`)
 .replace('initMediaMode();initFragmentRange();',match=>fs.readFileSync('camera.js','utf8')+'\n'+match)
 .replace("if(asset.kind==='video'){\n     const use=", "if(asset.kind==='video'){\n     if(!asset.silent){const use=")
 .replace('cell.append(use);if(!asset.liveStream)', 'cell.append(use);}if(!asset.liveStream)')
 .replace('</style>',`\n.camera-capture{margin-top:8px}.camera-capture video{display:block;width:100%;max-height:208px;object-fit:contain;background:#080e0c;border-radius:6px}
.camera-capture video[hidden]{display:none}.camera-actions{display:flex;flex-wrap:wrap;gap:5px;margin:8px 0 4px}
.camera-actions button{font-size:12px}.camera-actions button:disabled{opacity:.55}
</style>`);
html=html.replace('<button type="button" id="mutateMorph"',`<label class="audio-response-control">Audio response <select id="audioResponse"><option value="standard">Standard</option><option value="maximum">Maximum</option></select></label><button type="button" id="mutateMorph"`)
 .replace('analyser.fftSize=1024;analyser.smoothingTimeConstant=.45;freq=new Uint8Array(analyser.frequencyBinCount);','configureFileResponseMeter();')
 .replace('const session={tempo:', 'const session={audioResponse,tempo:')
 .replace('restoreTempo(data.tempo);', 'restoreTempo(data.tempo);setAudioResponse(data.audioResponse);')
 .replace('morph+=motionDelta*(reactive?.32:.075)*rack.state.morphRate;if(morph>=1){a=b;b=(b+1)%deck().length;morph=0;}',`const rate=rack.state.morphRate;
   morph+=motion.dynamic?delta*Math.min(3.1,motion.speed*.46*rate):motionDelta*(reactive?.32:.075)*rate;
   const hit=motion.dynamic?.onset&&rate>0&&morph>.18&&ms-lastBeat>230;
   if(morph>=1||hit){a=b;b=(b+1)%deck().length;morph=0;if(motion.dynamic)lastBeat=ms;}`)
 .replace('rack.process(ctx,images,delta,motion);','rack.process(ctx,images,delta,motion);drawMaximumResponse(ctx,motion,motionTime);')
 .replace('</style>','.audio-response-control{display:flex;align-items:center;gap:8px;margin:8px 0}.audio-response-control select{width:auto;margin:0}</style>');
html=html.replace('clipAudio=audioContext.createMediaStreamDestination();analyser.connect(clipAudio);','connectClipAudio();')
 .replace('function dimensions(){','function dimensions(){if(clipResolution||frozen)return;')
 .replace(/function micState\(label\)\{[^\n]+\}/,match=>match.slice(0,-1)+'syncClipMic();}')
 .replaceAll('Mic.toggle()', 'micInput.toggle()')
 .replaceAll('Mic.amplitude()', 'micInput.amplitude()')
 .replaceAll('Mic.spectrum?.()', 'micInput.spectrum?.()')
 .replaceAll('Mic.recordingStream?.()', 'micInput.recordingStream?.()')
 .replace('initMediaMode();initFragmentRange();',match=>fs.readFileSync('mic-input.js','utf8')+'\n'+match);
if(process.env.LOOM_LAYOUT!=='classic'){
 html=html.replace('</style>',()=>fs.readFileSync('studio-layout.css','utf8')+'</style>')
  .replace('initMediaMode();initFragmentRange();',match=>fs.readFileSync('studio-layout.js','utf8')+'\ninstallStudioLayout();'+match);
}
fs.writeFileSync('assets/index.html',html);
fs.copyFileSync('archive-pages.js','assets/archive.js');
fs.mkdirSync('res/drawable-nodpi',{recursive:true});
fs.writeFileSync('res/drawable-nodpi/loom.png',Buffer.from(await (await worker.fetch(new Request('https://loom.local/icon-192.png'))).arrayBuffer()));




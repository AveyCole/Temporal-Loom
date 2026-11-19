import fs from 'node:fs';

const root=new URL('../',import.meta.url);
const local=name=>new URL(name,import.meta.url);
const assets=new URL('assets/',root);
const bridge=fs.readFileSync(local('bridge.js'),'utf8').replace(/^\uFEFF/,'');
const windowCapture=fs.readFileSync(local('window-capture.js'),'utf8').replace(/^\uFEFF/,'');
const displayWindow=fs.readFileSync(local('display-window.js'),'utf8');
const input=fs.readFileSync(new URL('index.html',assets),'utf8');
if(!input.includes("<script>"))throw Error('Missing shared page script');
const knobStart=input.indexOf('function attachKnob(');
const tabsStart=input.indexOf(' const rackDetails=',knobStart);
const tabsEnd=input.indexOf(' sections[0].button.click();',tabsStart)+' sections[0].button.click();'.length;
const knobEnd=input.indexOf('installKnobs();',tabsEnd)+'installKnobs();'.length;
if(knobStart<0||tabsStart<=knobStart||tabsEnd<=tabsStart||knobEnd<=tabsEnd)throw Error('Missing shared effect tabs');
const sliderPage=input.slice(0,knobStart)+'(function installEffectTabs(){\n'+input.slice(tabsStart,tabsEnd)+'\n})();'+input.slice(knobEnd);
const policy="default-src 'self'; script-src 'self' 'unsafe-inline'; style-src 'self' 'unsafe-inline'; img-src 'self' data: blob:; font-src 'self' data:; media-src 'self' blob: data:; connect-src 'self'; frame-src 'none'; object-src 'none'; base-uri 'none'";
const result=sliderPage
  .replace('<head>',() => '<head><meta http-equiv="Content-Security-Policy" content="'+policy+'">')
  .replace('<script>',()=>'<script>\n'+bridge+'\n')
  .replace('function dimensions(){',match=>displayWindow+'\n'+match+'if(isDisplayOpen())return;')
  .replaceAll('requestAnimationFrame(frame);','scheduleStageFrame();')
  .replace("&&!document.getElementById('stageWrap').classList.contains('clean')","&&!document.getElementById('stageWrap').classList.contains('clean')&&!isDisplayOpen()")
  .replace('const enabled=!frozen&&!document.hidden&&!videoBackgrounded;',
    'const enabled=!frozen&&(isDisplayVisible()||(!document.hidden&&!videoBackgrounded));')
  .replace('<button type="button" id="recordClip"', '<button type="button" id="detachDisplay">Detach display</button><button type="button" id="displayFullscreen" hidden>Fullscreen display</button><button type="button" id="recordClip"')
  .replaceAll('Android MIDI','Windows MIDI').replace('Connect an Android MIDI input.','Connect a Windows MIDI input.')
  .replace('this Android WebView','this Windows browser runtime')
  .replace('hidden>Share clip</button>', 'hidden>Show saved clip</button>')
  .replace('<button id="cancelFind"','<button type="button" id="captureWindow">Capture window</button><button type="button" id="openYouTube">Open YouTube</button><button id="cancelFind"')
  .replace('initFragmentRange();initLooks();',match=>windowCapture+'\n'+match)
  .replace('<span id="topMic"></span>', '<label class="mic-device">Mic input <select id="micDevice"><option value="">System default</option></select></label><label class="mic-channel" id="micChannelField" hidden>Input channel <select id="micChannel"></select><meter id="micSignal" min="0" max="1" aria-label="Selected input level"></meter></label><span id="topMic"></span>')
  .replace('<small>Hold a knob, then drag.</small>','')
  .replace("$('weights').append(label);}",`const output=document.createElement('output');output.textContent=input.value;label.insertBefore(output,input);input.addEventListener('input',()=>output.textContent=input.value);$('weights').append(label);}`)
  .replace("for(const k of types)$(k).value=data.mix?.[k]??50;",`for(const k of types){$(k).value=data.mix?.[k]??50;$(k).dispatchEvent(new Event('input'));}`)
  .replace('</style>',()=>`
    .file-transport{position:relative}.workspace .stage-wrap:not(.expanded){max-height:68vh}.stage-wrap.expanded{max-height:none}
    .stage-detached #stageWrap{display:none}
    .mode-tabs{flex-wrap:wrap}.mode-tabs .mic-device{display:flex;align-items:center;gap:6px;margin:0 0 0 auto;font-size:12px}
    .mode-tabs .mic-device select{width:auto;max-width:225px;margin:0}.mode-tabs #topMic{margin-left:0}
    .mic-channel{display:flex;align-items:center;gap:6px;margin:0;font-size:12px}.mic-channel[hidden]{display:none}.mic-channel select{width:auto;max-width:190px;margin:0}.mic-channel meter{width:52px;height:10px}
    input[type=range]{display:block;height:24px;margin:3px 0 0;cursor:ew-resize}
    input[type=range]:focus-visible{outline:2px solid var(--acid);outline-offset:1px}
    #weights{grid-template-columns:repeat(2,minmax(0,1fr));gap:6px 14px}
    .control-grid,.knob-grid{gap:8px 18px}
    .knob-grid>label:has(input[type=range]){grid-column:auto}
    .knob-grid>label:has(select){grid-column:1/-1}
    #weights output,.knob-grid output{float:right;color:var(--acid);font:12px ui-monospace,monospace}
    </style>`);
new Function(result.match(/<script>([\s\S]+?)<\/script>/)[1]);
fs.mkdirSync(local('obj/'),{recursive:true});
fs.writeFileSync(local('obj/index.html'),result);
fs.copyFileSync(new URL('archive.js',assets),local('obj/archive.js'));
const png=fs.readFileSync(new URL('res/drawable-nodpi/loom.png',root));
const icon=Buffer.alloc(22);
icon.writeUInt16LE(1,2);icon.writeUInt16LE(1,4);icon[6]=icon[7]=192;
icon.writeUInt16LE(1,10);icon.writeUInt16LE(32,12);
icon.writeUInt32LE(png.length,14);icon.writeUInt32LE(22,18);
fs.writeFileSync(local('obj/loom.ico'),Buffer.concat([icon,png]));

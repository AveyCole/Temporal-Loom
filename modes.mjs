export function finishPage(html,viewfinder){
 html=html.replace(/<label>Word constellation<\/label>[\s\S]*?<p class="note" id="presetDescription"><\/p>/,'')
 .replace(/const PRESETS=.+?;\r?\n/,'')
 .replace(/function selectPreset\(key\)[\s\S]*?Object\.keys\(PRESETS\)[^\n]+\n/,'')
 .replace("let preset='municipal', assets", "let assets")
 .replaceAll('PRESETS[preset].blend',"'screen'").replaceAll('PRESETS[preset].hue','185')
 .replace(',preset,source:',',source:').replace('version:1,preset,date:', 'version:1,date:')
 .replace('||!PRESETS[data.preset]','').replace('selectPreset(data.preset);','')
 .replace(/<p>Presets expand[\s\S]*?<\/p>/,'')
 .replaceAll('Custom search words','Seed words').replace('Leave empty to use the preset and genre.','Leave empty to use the selected genre.')
 .replaceAll('Municipal dream','Live canvas').replace('a date and a word constellation','a date and your seed words').replace('another preset','different seed words')
 .replace('selectPreset(preset);dimensions();requestAnimationFrame(frame);',()=>viewfinder+"\n$('words').value=localStorage.getItem('seedWords')||'';$('words').addEventListener('input',()=>localStorage.setItem('seedWords',$('words').value));updateOutputs();dimensions();requestAnimationFrame(frame);")
 .replace('function frame(ms){dimensions();','function frame(ms){checkClipGate();dimensions();')
 .replace('rack.advance(motionDelta)','rack.advance(delta*(motion.fxSpeed??motion.speed))')
 .replace('</header>','</header><nav class="mode-tabs" aria-label="Instrument mode"><button id="studioTab" aria-pressed="true">Studio</button><button id="vfTab" aria-pressed="false">Viewfinder</button><span id="topMic"></span></nav>')
 .replace('<div class="performance">','<section id="radioPanel" hidden><h2>Viewfinder</h2><button id="pairButton">Pair random field recording</button><p id="pairStatus">Radio Aporee field recordings paired with media from the tagged location.</p><a id="fieldLink" hidden target="_blank" rel="noopener">Recording &amp; license</a></section><div class="performance">')
 .replace('<small id="clipStatus"', '<details class="rec-settings"><summary>Rec trigger</summary><label>Start recording <select id="recTrigger"><option value="immediate">Immediately</option><option value="armed">On playback or mic input</option></select></label><label id="recThresholdField" hidden>Mic threshold (%) <input type="number" id="recThreshold" min="1" max="100" step="1"></label></details><small id="clipStatus"')
 .replace('if(validLiveReference(item))continue;', "if(validLiveReference(item)||validCommonsReference(item))continue;")
 .replace("?'LIVE WEBSITE':'ARCHIVED MATERIAL'","?'LIVE WEBSITE':assets.some(x=>x.source==='Wikimedia Commons')?'VIEWFINDER':'ARCHIVED MATERIAL'")
 .replace('</style>', '.mode-tabs{display:flex;align-items:center;gap:5px;padding:6px 16px;background:#121d18;border-bottom:1px solid var(--line)}.mode-tabs button[aria-pressed=true]{background:var(--acid);color:#152018}.mode-tabs #topMic{margin-left:auto}.viewfinding main>aside{display:none}.viewfinding main{display:block}.viewfinding .workspace{max-width:1050px;margin:auto}#radioPanel{margin-bottom:12px}#radioPanel p{margin:5px 0}.rec-settings{font-size:12px}.rec-settings label{display:flex;flex-wrap:wrap}.rec-settings label[hidden]{display:none}.rec-settings select{width:auto;max-width:100%;margin:0}.rec-settings input{width:5em}.stage-wrap.expanded{height:100dvh;width:100vw;aspect-ratio:auto;max-width:none;max-height:none;min-height:0;border:0;border-radius:0}</style>');
 return html;
}
export function finishArchive(js){
 return js.replace(/const PRESETS = \{[\s\S]*?\n\};/,'')
 .replace(/ const preset=PRESETS[^\n]+/,'')
 .replaceAll('preset:preset.name,','').replace("preset:(PRESETS[params.get('preset')]||PRESETS.municipal).name,",'')
 .replace("params.get('words')||preset.terms.join(',')","params.get('words')||''")
 .replace('[...new Set([...preset.terms,...genreTerms])]','genreTerms').replace('Preset words rank','Seed words rank');
}

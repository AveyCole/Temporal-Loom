import fs from 'node:fs';
import path from 'node:path';
import {fileURLToPath} from 'node:url';
const here=path.dirname(fileURLToPath(import.meta.url));
process.chdir(path.join(here,'..'));
await import('../port.mjs');
// Use the Windows desktop generator so sliders, display controls, capture,
// and changes to the shared engine stay aligned across desktop platforms.
await import('../windows/desktop.mjs');
fs.rmSync(path.join(here,'assets'),{recursive:true,force:true});
fs.cpSync('assets',path.join(here,'assets'),{recursive:true});
fs.cpSync('web-template',path.join(here,'web-template'),{recursive:true});
const windowsBridge=fs.readFileSync('windows/bridge.js','utf8').replace(/^\uFEFF/,'');
let html=fs.readFileSync('windows/obj/index.html','utf8');
if(!html.includes(windowsBridge))throw Error('Desktop bridge insertion point changed');
html=html.replace(windowsBridge,()=>fs.readFileSync(path.join(here,'bridge.js'),'utf8'))
 .replaceAll('window.chrome.webview.postMessage','window.loom.send')
 .replace('const cameraIsWindows=Boolean(window.chrome?.webview);','const cameraIsWindows=true;')
 .replaceAll('Windows MIDI','macOS MIDI').replaceAll('an macOS MIDI','a macOS MIDI').replaceAll('Windows browser runtime','macOS browser runtime')
 .replaceAll('Windows microphone access','macOS microphone access')
 .replace('<button type="button" id="asioSettings">ASIO settings</button>','');
new Function(html.match(/<script>([\s\S]+?)<\/script>/)[1]);
fs.writeFileSync(path.join(here,'assets/index.html'),html);
const display=fs.readFileSync('windows/display.html','utf8').replaceAll('window.chrome.webview.postMessage','window.loom.send');
fs.writeFileSync(path.join(here,'assets/display.html'),display);

const sourceVersion=fs.readFileSync('AndroidManifest.xml','utf8').match(/android:versionName="([0-9.]+)"/)?.[1];
if(!sourceVersion)throw Error('Missing shared application version');
const version=sourceVersion.split('.').concat(['0','0']).slice(0,3).join('.');
for(const name of ['package.json','package-lock.json']){const file=path.join(here,name),data=JSON.parse(fs.readFileSync(file,'utf8'));data.version=version;if(data.packages?.[''])data.packages[''].version=version;fs.writeFileSync(file,JSON.stringify(data,null,2)+'\n');}

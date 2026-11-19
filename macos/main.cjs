const {app,BrowserWindow,ipcMain,dialog,shell,session,Menu,desktopCapturer}=require('electron');
const fs=require('node:fs'),path=require('node:path'),crypto=require('node:crypto');
const {createMediaServer,listFolder}=require('./media-server.cjs');
const {toMP4,decodeAudio}=require('./ffmpeg.cjs');
const {createGoogle}=require('./google.cjs');
let win,output,server,google,origin,clipPath,clipFD,lastClip,encoding=false,tempDirectory;
const files=new Map(),decoded=new Map(),thumbs=new Map();
function sendScript(script){if(win&&!win.isDestroyed())return win.webContents.executeJavaScript(script).catch(()=>{});}
function status(message){sendScript('clipStatus('+JSON.stringify(message)+')');}
function external(url){if(/^https?:\/\//.test(url))shell.openExternal(url);}
function trusted(event){return event.sender===win?.webContents;}
function discard(){if(encoding)return;if(clipFD!==undefined){fs.closeSync(clipFD);clipFD=undefined;}if(clipPath){fs.rmSync(clipPath,{force:true});clipPath=null;}}
function tempFile(ext){return path.join(tempDirectory,crypto.randomUUID()+ext);}
ipcMain.on('loom-sync',(event,m)=>{
 event.returnValue=false;if(!trusted(event))return;
 try{if(m.action==='beginClip'){if(encoding||clipPath)return;clipPath=tempFile(m.format==='mp4'?'.mp4':'.webm');clipFD=fs.openSync(clipPath,'wx');event.returnValue=true;}
 else if(m.action==='writeClip'&&clipFD!==undefined&&typeof m.data==='string'&&m.data.length<=180000){fs.writeSync(clipFD,Buffer.from(m.data,'base64'));event.returnValue=true;}}catch{discard();}
});
ipcMain.handle('decode-video-audio',async(event,input)=>{
 if(!trusted(event))return null;const source=input.file||files.get((input.url||'').replace(/^\/folder\//,''));
 if(!source||!fs.existsSync(source)||!fs.statSync(source).isFile())return null;
 const destination=tempFile('.m4a'),url='/decoded-audio/'+path.basename(destination);
 try{await decodeAudio(source,destination);decoded.set(url,destination);return url;}catch{fs.rmSync(destination,{force:true});return null;}
});
async function finishClip(){
 if(encoding||clipFD===undefined)return;fs.closeSync(clipFD);clipFD=undefined;encoding=true;
 const source=clipPath;clipPath=null;const encoded=tempFile('.mp4');
 try{const choice=await dialog.showSaveDialog(win,{defaultPath:'Temporal-Loom-'+new Date().toISOString().replace(/[:.]/g,'-')+'.mp4',filters:[{name:'MP4 video',extensions:['mp4']}]});
 if(choice.canceled){status('Clip save cancelled.');return;}status('Preparing MP4…');await toMP4(source,encoded);fs.copyFileSync(encoded,choice.filePath);lastClip=choice.filePath;status('Clip saved.');sendScript("document.getElementById('shareClip').hidden=false");}
 catch(error){status('Could not save the MP4. '+error.message);}
 finally{fs.rmSync(source,{force:true});fs.rmSync(encoded,{force:true});encoding=false;}
}
ipcMain.on('loom',async(event,m)=>{
 if(event.sender===output?.webContents){if(m.action==='toggleFullscreen')output.setFullScreen(!output.isFullScreen());if(m.action==='exitFullscreen')output.setFullScreen(false);return;}
 if(!trusted(event))return;
 try{switch(m.action){
 case 'folder':{const choice=await dialog.showOpenDialog(win,{properties:['openDirectory']});const items=choice.canceled?[]:listFolder(choice.filePaths[0],m.media,files);await sendScript('folderPicked('+JSON.stringify(items)+','+JSON.stringify(choice.canceled?'Folder selection cancelled.':'No supported files of the selected type in this folder.')+')');break;}
 case 'full':win.setFullScreen(!!m.value);break;
 case 'displayFullscreen':if(output&&!output.isDestroyed())output.setFullScreen(!output.isFullScreen());break;
 case 'reattachDisplay':output?.close();break;
 case 'googleSearch':google.search(m.id,String(m.query).slice(0,500),Math.max(0,Number(m.offset)||0));break;
 case 'browseGoogle':await google.open(String(m.query||''));break;
 case 'shareClip':if(lastClip)shell.showItemInFolder(lastClip);break;
 case 'discardClip':discard();break;
 case 'finishClip':await finishClip();break;
 case 'save':{const choice=await dialog.showSaveDialog(win,{defaultPath:path.basename(m.name)});if(!choice.canceled)fs.writeFileSync(choice.filePath,Buffer.from(m.data,'base64'));break;}
 case 'releaseVideoAudio':{const f=decoded.get(m.url);if(f){decoded.delete(m.url);fs.rmSync(f,{force:true});}break;}
 }}catch(error){dialog.showErrorBox('Temporal Loom',error.message);}
});
app.whenReady().then(async()=>{
 tempDirectory=fs.mkdtempSync(path.join(app.getPath('temp'),'temporal-loom-'));
 const worker=(await import('./web-template/worker.mjs')).default;
 server=createMediaServer({root:path.join(__dirname,'assets'),worker,files,decoded,thumbs});
 await new Promise(resolve=>server.listen(0,'127.0.0.1',resolve));origin='http://127.0.0.1:'+server.address().port;
 const permissions=new Set(['media','midi','midiSysex','fullscreen','display-capture']);
 session.defaultSession.setPermissionRequestHandler((wc,permission,callback)=>callback(wc===win?.webContents&&permissions.has(permission)));
 session.defaultSession.setPermissionCheckHandler((wc,permission)=>wc===win?.webContents&&permissions.has(permission));
 session.defaultSession.setDisplayMediaRequestHandler(async(request,callback)=>{
  if(!request.frame.url.startsWith(origin+'/')){callback({});return;}
  try{const sources=(await desktopCapturer.getSources({types:['window','screen']})).filter(s=>!s.name.startsWith('Temporal Loom'));
   if(!sources.length){callback({});return;}const options=sources.slice(0,30);const picked=await dialog.showMessageBox(win,{type:'question',message:'Choose a window or display to capture',buttons:[...options.map(s=>s.name),'Cancel'],cancelId:options.length,noLink:true});
   if(picked.response>=options.length){callback({});return;}callback({video:options[picked.response]});
  }catch{callback({});}
 },{useSystemPicker:true});
 win=new BrowserWindow({width:1440,height:960,minWidth:900,minHeight:650,title:'Temporal Loom',backgroundColor:'#101817',webPreferences:{preload:path.join(__dirname,'preload.cjs'),contextIsolation:true,nodeIntegration:false,sandbox:true,backgroundThrottling:false}});
 google=createGoogle({owner:win,thumbs,external,reply:(id,items,issue)=>sendScript('googleResult('+JSON.stringify(id)+','+JSON.stringify(items)+','+JSON.stringify(issue)+')')});
 win.webContents.setWindowOpenHandler(({url})=>{
  if(url===origin+'/display'&&(!output||output.isDestroyed()))return {action:'allow',overrideBrowserWindowOptions:{width:1280,height:800,title:'Temporal Loom Display',backgroundColor:'#000000',autoHideMenuBar:true,webPreferences:{preload:path.join(__dirname,'preload.cjs'),contextIsolation:true,nodeIntegration:false,sandbox:true,backgroundThrottling:false}}};
  external(url);return {action:'deny'};
 });
 win.webContents.on('did-create-window',(window,{url})=>{if(url!==origin+'/display')return;output=window;window.webContents.on('will-navigate',(event,target)=>{if(target!==origin+'/display')event.preventDefault();});window.webContents.setWindowOpenHandler(()=>({action:'deny'}));window.on('closed',()=>{output=null;sendScript('displayDisconnected()');});});
 win.webContents.on('will-navigate',(event,url)=>{if(new URL(url).origin!==origin){event.preventDefault();external(url);}});
 win.on('closed',()=>{output?.destroy();google.close();});
 Menu.setApplicationMenu(Menu.buildFromTemplate([{label:app.name,submenu:[{role:'about'},{type:'separator'},{role:'quit'}]},{role:'editMenu'},{role:'viewMenu'},{role:'windowMenu'}]));
 await win.loadURL(origin);
 if(process.env.LOOM_SMOKE_TEST){const errors=[];win.webContents.on('console-message',(_,level,message)=>{if(level>=3)errors.push(message);});setTimeout(async()=>{console.log(JSON.stringify(await win.webContents.executeJavaScript(`({title:document.title,canvas:!!document.querySelector('canvas'),bridge:typeof Mic,detach:!!document.getElementById('detachDisplay'),capture:!!document.getElementById('captureWindow')})`)));console.log(JSON.stringify({errors}));app.quit();},4000);}
});
app.on('window-all-closed',()=>app.quit());
app.on('before-quit',()=>{google?.close();encoding=false;discard();server?.close();if(tempDirectory)fs.rmSync(tempDirectory,{recursive:true,force:true});});

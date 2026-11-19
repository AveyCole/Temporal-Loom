const {contextBridge,ipcRenderer,webUtils}=require('electron');
contextBridge.exposeInMainWorld('loom',{
 send:(action,data={})=>ipcRenderer.send('loom',typeof action==='object'?action:{action,...data}),
 call:(action,data)=>ipcRenderer.sendSync('loom-sync',{action,...data}),
 decodeVideoAudio:fileOrURL=>ipcRenderer.invoke('decode-video-audio',typeof fileOrURL==='string'?{url:fileOrURL}:{file:webUtils.getPathForFile(fileOrURL)})
});

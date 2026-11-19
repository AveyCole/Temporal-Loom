const {contextBridge,ipcRenderer}=require('electron');
contextBridge.exposeInMainWorld('loom',{send:(action,data)=>ipcRenderer.send('loom',{action,...data}),call:(action,data)=>ipcRenderer.sendSync('loom-sync',{action,...data})});

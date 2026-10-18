const {contextBridge,ipcRenderer}=require('electron');
contextBridge.exposeInMainWorld('probeBridge',{
 send:(peerId,namespace,data)=>ipcRenderer.invoke('rtc-probe-send',peerId,namespace,data),
 controls:fn=>ipcRenderer.on('rtc-probe-control',(_event,value)=>fn(value)),
});

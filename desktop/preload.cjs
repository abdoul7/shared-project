const { contextBridge, ipcRenderer } = require('electron');
contextBridge.exposeInMainWorld('stillroom', Object.freeze({
  call: (name, ...args) => {
    if (!['state', 'card', 'contact', 'ca', 'connect', 'disconnect', 'send', 'retry', 'rtc-send', 'rtc-config', 'rtc-settings', 'media-consent', 'share-sources', 'share-select', 'file-offer', 'file-accept', 'file-retry', 'file-cancel', 'bulk-result', 'bulk-received'].includes(name)) return Promise.reject(new Error('Unknown action'));
    return ipcRenderer.invoke(name, ...args);
  },
  on: (channel, callback) => { if (!['rtc-control','bulk-send'].includes(channel)) throw Error('Unknown event'); const listener=(_event,value)=>callback(value); ipcRenderer.on(channel,listener); return ()=>ipcRenderer.removeListener(channel,listener); },
  subscribe: callback => { const listener = (_event, state) => callback(state); ipcRenderer.on('changed', listener); return () => ipcRenderer.removeListener('changed', listener); }
}));

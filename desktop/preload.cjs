const { contextBridge, ipcRenderer } = require('electron');
contextBridge.exposeInMainWorld('stillroom', Object.freeze({
  call: (name, ...args) => {
    if (!['state', 'card', 'contact', 'ca', 'connect', 'disconnect', 'send', 'retry'].includes(name)) return Promise.reject(new Error('Unknown action'));
    return ipcRenderer.invoke(name, ...args);
  },
  subscribe: callback => { const listener = (_event, state) => callback(state); ipcRenderer.on('changed', listener); return () => ipcRenderer.removeListener('changed', listener); }
}));

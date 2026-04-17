const { contextBridge, ipcRenderer } = require('electron');

contextBridge.exposeInMainWorld('api', {
  connect: () => ipcRenderer.invoke('whatsapp:connect'),
  disconnect: () => ipcRenderer.invoke('whatsapp:disconnect'),
  getStatus: () => ipcRenderer.invoke('whatsapp:status'),
  parseExcel: (buffer) => ipcRenderer.invoke('excel:parse', buffer),
  sendBulk: (payload) => ipcRenderer.invoke('send:bulk', payload),
  cancelSend: () => ipcRenderer.invoke('send:cancel'),

  onQr: (fn) => {
    const handler = (_e, dataUrl) => fn(dataUrl);
    ipcRenderer.on('whatsapp:qr', handler);
    return () => ipcRenderer.removeListener('whatsapp:qr', handler);
  },
  onReady: (fn) => {
    const handler = () => fn();
    ipcRenderer.on('whatsapp:ready', handler);
    return () => ipcRenderer.removeListener('whatsapp:ready', handler);
  },
  onAuthenticated: (fn) => {
    const handler = () => fn();
    ipcRenderer.on('whatsapp:authenticated', handler);
    return () => ipcRenderer.removeListener('whatsapp:authenticated', handler);
  },
  onAuthFailure: (fn) => {
    const handler = (_e, msg) => fn(msg);
    ipcRenderer.on('whatsapp:auth_failure', handler);
    return () => ipcRenderer.removeListener('whatsapp:auth_failure', handler);
  },
  onDisconnected: (fn) => {
    const handler = (_e, reason) => fn(reason);
    ipcRenderer.on('whatsapp:disconnected', handler);
    return () => ipcRenderer.removeListener('whatsapp:disconnected', handler);
  },
  onSendProgress: (fn) => {
    const handler = (_e, data) => fn(data);
    ipcRenderer.on('send:progress', handler);
    return () => ipcRenderer.removeListener('send:progress', handler);
  },
  onSendDone: (fn) => {
    const handler = (_e, data) => fn(data);
    ipcRenderer.on('send:done', handler);
    return () => ipcRenderer.removeListener('send:done', handler);
  },
  onSendError: (fn) => {
    const handler = (_e, err) => fn(err);
    ipcRenderer.on('send:error', handler);
    return () => ipcRenderer.removeListener('send:error', handler);
  },
});

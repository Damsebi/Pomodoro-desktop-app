'use strict';

const { contextBridge, ipcRenderer } = require('electron');

// 화면(app.js)에서 쓸 수 있는 기능만 노출한다. 타이머 계산은 메인 프로세스가 담당한다.
contextBridge.exposeInMainWorld('pomodoro', {
  getState: () => ipcRenderer.invoke('timer:get-state'),
  start: () => ipcRenderer.invoke('timer:start'),
  pause: () => ipcRenderer.invoke('timer:pause'),
  skip: () => ipcRenderer.invoke('timer:skip'),
  reset: () => ipcRenderer.invoke('timer:reset'),
  updateSettings: (patch) => ipcRenderer.invoke('settings:update', patch),
  onState: (callback) => {
    ipcRenderer.on('timer:state', (_event, snapshot) => callback(snapshot));
  },
  // Windows 로그인 시 자동 실행
  getLoginItem: () => ipcRenderer.invoke('login-item:get'),
  setLoginItem: (enabled) => ipcRenderer.invoke('login-item:set', enabled),
  onLoginItemState: (callback) => {
    ipcRenderer.on('login-item:state', (_event, state) => callback(state));
  },
});

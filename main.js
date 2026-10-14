'use strict';

const fs = require('node:fs');
const path = require('node:path');
const { app, BrowserWindow, Menu, Notification, ipcMain, nativeTheme, powerMonitor } = require('electron');
const { PomodoroTimer, applySettingsPatch, notificationTitle, sanitizeSettings } = require('./timer');

// package.json의 build.appId와 같아야 설치본에서 Windows 알림이 앱 이름과 아이콘으로 표시된다.
// Windows는 처음 알림을 보낸 실행 파일 정보를 이 ID에 묶어 기억하므로,
// 개발 실행(electron.exe)은 다른 ID를 써서 설치본의 알림 표시가 "Electron"으로 굳지 않게 한다.
const APP_ID = 'com.ppomodoro.desktop';

let win = null;
let timer = null;
let lastNotification = null; // 참조를 유지해야 알림 클릭 이벤트가 사라지지 않는다.

// ---------- 설정 파일 ----------

function settingsPath() {
  return path.join(app.getPath('userData'), 'settings.json');
}

function loadSettings() {
  try {
    return sanitizeSettings(JSON.parse(fs.readFileSync(settingsPath(), 'utf8')));
  } catch {
    return sanitizeSettings(null); // 파일이 없거나 깨졌으면 기본값
  }
}

function saveSettings(settings) {
  const file = settingsPath();
  const tmp = `${file}.tmp`;
  try {
    fs.mkdirSync(path.dirname(file), { recursive: true });
    fs.writeFileSync(tmp, JSON.stringify(settings, null, 2));
    fs.renameSync(tmp, file);
  } catch (err) {
    console.error('설정을 저장하지 못했어요:', err);
  }
}

// ---------- 창 ----------

function showWindow() {
  if (!win) return;
  if (win.isMinimized()) win.restore();
  win.show();
  win.focus();
}

function sendState(snapshot) {
  if (win && !win.isDestroyed()) win.webContents.send('timer:state', snapshot);
}

function createWindow() {
  win = new BrowserWindow({
    width: 900,
    height: 600,
    minWidth: 380,
    minHeight: 520,
    useContentSize: true,
    show: false,
    title: '뽀모도로 타이머',
    backgroundColor: nativeTheme.shouldUseDarkColors ? '#16181c' : '#f6f4f1',
    webPreferences: {
      preload: path.join(__dirname, 'preload.js'),
    },
  });
  win.once('ready-to-show', () => win.show());
  // 앱에 포함된 화면 밖으로 이동하거나 새 창을 여는 것을 막는다.
  win.webContents.setWindowOpenHandler(() => ({ action: 'deny' }));
  win.webContents.on('will-navigate', (event) => event.preventDefault());
  win.on('closed', () => {
    win = null;
  });
  win.loadFile(path.join(__dirname, 'index.html'));
}

// ---------- 종료 알림 ----------

function notifyCompletion(transitions) {
  if (!Notification.isSupported()) return;
  const last = transitions[transitions.length - 1];
  const body = transitions.length > 1
    ? `자리를 비운 동안 ${transitions.length}개 단계가 끝났어요.`
    : timer.settings.autoStart
      ? '다음 단계를 자동으로 시작했어요.'
      : '앱에서 시작 버튼을 누르면 진행돼요.';
  const notification = new Notification({ title: notificationTitle(last), body, silent: true });
  notification.on('click', showWindow);
  notification.on('failed', (_event, error) => console.error('알림을 표시하지 못했어요:', error));
  notification.show();
  lastNotification = notification;
}

// ---------- 앱 ----------

if (!app.requestSingleInstanceLock()) {
  // 이미 실행 중이면 두 번째 타이머를 만들지 않고 기존 창을 띄운다.
  app.quit();
} else {
  app.on('second-instance', showWindow);

  app.whenReady().then(() => {
    if (process.platform === 'win32') app.setAppUserModelId(app.isPackaged ? APP_ID : `${APP_ID}.dev`);
    Menu.setApplicationMenu(null);

    timer = new PomodoroTimer({
      settings: loadSettings(),
      onUpdate: sendState,
      onComplete: notifyCompletion,
    });

    ipcMain.handle('timer:get-state', () => timer.snapshot());
    ipcMain.handle('timer:start', () => timer.start());
    ipcMain.handle('timer:pause', () => timer.pause());
    ipcMain.handle('timer:skip', () => timer.skip());
    ipcMain.handle('timer:reset', () => timer.reset());
    ipcMain.handle('settings:update', (_event, patch) => {
      const next = applySettingsPatch(timer.settings, patch);
      if (!next || !timer.updateSettings(next)) return false;
      saveSettings(next);
      return true;
    });

    // 절전·잠금에서 돌아오면 실제 경과 시간을 바로 반영한다.
    powerMonitor.on('resume', () => timer.tick());
    powerMonitor.on('unlock-screen', () => timer.tick());

    createWindow();
  });

  // 창을 닫으면 앱과 타이머를 함께 종료한다.
  app.on('window-all-closed', () => app.quit());
  app.on('will-quit', () => timer?.dispose());
}

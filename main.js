'use strict';

const fs = require('node:fs');
const path = require('node:path');
const { app, BrowserWindow, Menu, Notification, ipcMain, nativeTheme, powerMonitor } = require('electron');
const { PHASE_NAMES, PomodoroTimer, applySettingsPatch, notificationTitle, sanitizeSettings } = require('./timer');

// package.json의 build.appId와 같아야 설치본에서 Windows 알림이 앱 이름과 아이콘으로 표시된다.
// Windows는 처음 알림을 보낸 실행 파일 정보를 이 ID에 묶어 기억하므로,
// 개발 실행(electron.exe)은 다른 ID를 써서 설치본의 알림 표시가 "Electron"으로 굳지 않게 한다.
const APP_ID = 'com.ppomodoro.desktop';
// Windows 시작앱 등록에 쓰는 레지스트리(Run) 값 이름. build/installer.nsh의 제거 스크립트와 같아야 한다.
const LOGIN_ITEM_NAME = APP_ID;

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

// 창 제목(작업 표시줄)에도 남은 시간을 보여 최소화 중에도 확인할 수 있게 한다.
function windowTitle(snapshot) {
  return `${snapshot.timeText} ${PHASE_NAMES[snapshot.phase]} · 뽀모도로`;
}

function sendState(snapshot) {
  if (!win || win.isDestroyed()) return;
  const title = windowTitle(snapshot);
  if (win.getTitle() !== title) win.setTitle(title);
  // 최소화 중에는 보이지 않는 화면을 갱신하지 않는다. 창을 복원하면 최신 상태를 바로 보낸다.
  if (!win.isMinimized()) win.webContents.send('timer:state', snapshot);
}

function createWindow() {
  win = new BrowserWindow({
    width: 900,
    height: 600,
    minWidth: 380,
    minHeight: 520,
    useContentSize: true,
    show: false,
    title: windowTitle(timer.snapshot()),
    backgroundColor: nativeTheme.shouldUseDarkColors ? '#16181c' : '#f6f4f1',
    webPreferences: {
      preload: path.join(__dirname, 'preload.js'),
    },
  });
  win.once('ready-to-show', () => win.show());
  // 앱에 포함된 화면 밖으로 이동하거나 새 창을 여는 것을 막는다.
  win.webContents.setWindowOpenHandler(() => ({ action: 'deny' }));
  win.webContents.on('will-navigate', (event) => event.preventDefault());
  // 창 제목은 메인 프로세스가 관리한다. 페이지의 <title>로 덮어쓰지 않는다.
  win.on('page-title-updated', (event) => event.preventDefault());
  win.on('restore', () => sendState(timer.snapshot()));
  // Windows 설정이나 작업 관리자에서 시작앱을 바꾼 뒤 돌아오면 실제 상태를 다시 보여 준다.
  win.on('focus', () => win.webContents.send('login-item:state', getLoginItemState()));
  win.on('closed', () => {
    win = null;
  });
  win.loadFile(path.join(__dirname, 'index.html'));
}

// ---------- Windows 로그인 시 자동 실행 ----------

// 개발 모드(electron.exe)는 시작앱에 등록하지 않는다. 설치된 앱의 실행 파일만 등록한다.
function loginItemSupported() {
  return process.platform === 'win32' && app.isPackaged;
}

// 레지스트리의 실제 등록 상태를 읽는다.
// enabled: 다음 로그인 때 실행됨, disabledBySystem: 등록은 되어 있지만 Windows 설정·작업 관리자에서 꺼짐
function getLoginItemState() {
  if (!loginItemSupported()) return { supported: false, enabled: false, disabledBySystem: false };
  const { launchItems = [] } = app.getLoginItemSettings({ path: process.execPath, args: [] });
  const item = launchItems.find((entry) => entry.name === LOGIN_ITEM_NAME && entry.scope === 'user');
  return { supported: true, enabled: Boolean(item?.enabled), disabledBySystem: Boolean(item && !item.enabled) };
}

// setLoginItemSettings는 실패를 알려 주지 않으므로, 바꾼 뒤 실제 상태를 다시 읽어 확인한다.
function setLoginItem(enabled) {
  if (!loginItemSupported()) {
    return { ok: false, error: '설치된 앱에서만 사용할 수 있어요.', state: getLoginItemState() };
  }
  try {
    app.setLoginItemSettings({
      openAtLogin: enabled,
      enabled, // 켤 때는 Windows 설정·작업 관리자의 "사용 안 함"도 함께 해제한다.
      path: process.execPath,
      args: [],
      name: LOGIN_ITEM_NAME,
    });
  } catch (err) {
    console.error('시작앱 설정을 바꾸지 못했어요:', err);
  }
  const state = getLoginItemState();
  if (state.enabled !== enabled) {
    return { ok: false, error: enabled ? '시작앱에 등록하지 못했어요.' : '시작앱 등록을 해제하지 못했어요.', state };
  }
  return { ok: true, state };
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
    ipcMain.handle('login-item:get', () => getLoginItemState());
    ipcMain.handle('login-item:set', (_event, enabled) => {
      if (typeof enabled !== 'boolean') return { ok: false, error: '잘못된 요청이에요.', state: getLoginItemState() };
      return setLoginItem(enabled);
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

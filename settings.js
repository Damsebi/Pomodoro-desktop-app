(() => {
  'use strict';

  // 설정창: 시간·횟수·자동 시작(초기화 상태에서만 변경), 단계 전환 알림 방식(언제나 변경), 시작앱 등록.
  // 값의 검증·저장은 메인 프로세스(main.js, timer.js)가 맡는다.

  const NUMBER_KEYS = ['focusMin', 'shortMin', 'longMin', 'longEvery'];

  const $ = (id) => document.getElementById(id);
  const el = {
    form: $('settings-form'),
    fieldset: $('settings-fieldset'),
    lockNote: $('lock-note'),
    autoStart: $('autoStart'),
    loginItem: $('loginItem'),
    loginItemNote: $('login-item-note'),
    loginItemError: $('login-item-error'),
  };
  const inputs = Object.fromEntries(NUMBER_KEYS.map((key) => [key, $(key)]));
  const notifyRadios = [...document.querySelectorAll('input[name="notifyMode"]')];

  const api = window.pomodoro;
  if (!api) return;

  let current = null;   // 메인 프로세스에서 받은 최신 상태
  let settings = null;  // 입력란을 되돌릴 때 쓰는 마지막 유효 설정

  function render(state) {
    const firstRender = current === null;
    current = state;
    if (firstRender || el.fieldset.disabled !== state.inProgress) {
      el.fieldset.disabled = state.inProgress;
      el.lockNote.hidden = !state.inProgress;
      // 처음 열 때와 잠길 때만 입력란을 채운다. 입력 중인 값을 덮어쓰지 않기 위해서다.
      fillSettingsForm(state.settings);
    }
    for (const radio of notifyRadios) radio.checked = radio.value === state.settings.notifyMode;
  }

  // ---------- 설정 폼 ----------

  function parsePositiveInt(value, max) {
    const text = String(value).trim();
    if (!/^\d+$/.test(text)) return null;
    const n = Number(text);
    return n >= 1 && n <= max ? n : null;
  }

  function setFieldError(input, text) {
    input.setAttribute('aria-invalid', text ? 'true' : 'false');
    $(`${input.id}-error`).textContent = text;
  }

  function fillSettingsForm(next) {
    settings = { ...next };
    for (const key of NUMBER_KEYS) {
      inputs[key].value = settings[key];
      setFieldError(inputs[key], '');
    }
    el.autoStart.checked = settings.autoStart;
  }

  function onNumberInput(event) {
    const input = event.target;
    const max = Number(input.max);
    const n = parsePositiveInt(input.value, max);
    setFieldError(input, n === null ? `1~${max} 사이의 정수를 입력하세요.` : '');
    if (n === null || current.inProgress) return;
    settings[input.name] = n;
    api.updateSettings({ [input.name]: n });
  }

  function onNumberChange(event) {
    // 입력을 마쳤을 때 잘못된 값이면 마지막으로 저장된 값으로 되돌린다.
    const input = event.target;
    input.value = settings[input.name];
    setFieldError(input, '');
  }

  for (const input of Object.values(inputs)) {
    // 숫자가 아닌 문자(-, +, ., e 등)는 타이핑·붙여넣기 단계에서 막는다.
    input.addEventListener('beforeinput', (event) => {
      const text = event.data ?? event.dataTransfer?.getData('text/plain') ?? '';
      if (/\D/.test(text)) event.preventDefault();
    });
    input.addEventListener('input', onNumberInput);
    input.addEventListener('change', onNumberChange);
  }

  el.autoStart.addEventListener('change', () => {
    if (current.inProgress) return;
    settings.autoStart = el.autoStart.checked;
    api.updateSettings({ autoStart: settings.autoStart });
  });

  el.form.addEventListener('submit', (event) => event.preventDefault());

  for (const radio of notifyRadios) {
    radio.addEventListener('change', () => {
      if (radio.checked) api.updateSettings({ notifyMode: radio.value });
    });
  }

  // ---------- Windows 로그인 시 자동 실행 ----------
  // 토글은 메인 프로세스가 읽은 실제 시작앱 등록 상태를 그대로 보여 준다.

  let loginItemPending = false;

  function renderLoginItem(state) {
    el.loginItem.checked = state.enabled;
    el.loginItem.disabled = !state.supported || loginItemPending;
    el.loginItemNote.textContent = !state.supported
      ? '개발 모드에서는 시작앱에 등록하지 않아요. 설치된 앱에서 사용할 수 있어요.'
      : state.disabledBySystem
        ? 'Windows 설정 또는 작업 관리자에서 시작앱이 꺼져 있어요. 다시 켜면 사용으로 바뀌어요.'
        : '켜면 Windows에 로그인할 때 앱이 열려요. 타이머는 시작 버튼을 누를 때까지 대기해요.';
  }

  el.loginItem.addEventListener('change', async () => {
    const wanted = el.loginItem.checked;
    loginItemPending = true;
    el.loginItem.disabled = true;
    el.loginItemError.textContent = '';
    let result;
    try {
      result = await api.setLoginItem(wanted);
    } catch {
      result = { ok: false, error: '시작앱 설정을 바꾸지 못했어요.', state: null };
    }
    loginItemPending = false;
    // 실패하면 실제 상태(보통 이전 상태)로 되돌리고 오류를 보여 준다.
    renderLoginItem(result.state ?? { supported: true, enabled: !wanted, disabledBySystem: false });
    if (!result.ok) el.loginItemError.textContent = result.error;
  });

  // ---------- 시작 ----------

  api.onState(render);
  api.getState().then(render);
  api.onLoginItemState((state) => {
    if (!loginItemPending) renderLoginItem(state);
  });
  api.getLoginItem().then(renderLoginItem);
})();

(() => {
  'use strict';

  // 타이머 상태와 종료 시각 계산, 알림, 설정 저장은 메인 프로세스(main.js, timer.js)가 맡는다.
  // 이 파일은 메인에서 받은 상태를 그리고 사용자 조작을 전달한다.

  const NUMBER_KEYS = ['focusMin', 'shortMin', 'longMin', 'longEvery'];
  const PHASE_NAMES = { focus: '집중', short: '짧은 휴식', long: '긴 휴식' };

  const $ = (id) => document.getElementById(id);
  const el = {
    phase: $('phase'),
    round: $('round'),
    time: $('time'),
    bar: $('progress-bar'),
    toggle: $('toggle-btn'),
    skip: $('skip-btn'),
    reset: $('reset-btn'),
    message: $('message'),
    form: $('settings-form'),
    fieldset: $('settings-fieldset'),
    lockNote: $('lock-note'),
    autoStart: $('autoStart'),
    loginItem: $('loginItem'),
    loginItemNote: $('login-item-note'),
    loginItemError: $('login-item-error'),
  };
  const inputs = Object.fromEntries(NUMBER_KEYS.map((key) => [key, $(key)]));

  const api = window.pomodoro;
  if (!api) {
    el.message.textContent = '이 화면은 뽀모도로 데스크톱 앱에서 실행해야 해요.';
    return;
  }

  let current = null;   // 메인 프로세스에서 받은 최신 상태
  let settings = null;  // 입력란을 되돌릴 때 쓰는 마지막 유효 설정

  // ---------- 화면 ----------

  function formatTime(ms) {
    const totalSec = Math.ceil(ms / 1000);
    const m = Math.floor(totalSec / 60);
    const s = totalSec % 60;
    return `${String(m).padStart(2, '0')}:${String(s).padStart(2, '0')}`;
  }

  function render(state) {
    const firstRender = current === null;
    current = state;

    const time = formatTime(state.remainingMs);
    const phaseName = PHASE_NAMES[state.phase];
    const { longEvery } = state.settings;

    document.body.dataset.phase = state.phase;
    document.body.dataset.status = state.status;
    el.time.textContent = time;
    el.phase.textContent = phaseName;
    el.round.textContent = state.phase === 'focus'
      ? `집중 ${state.completed + 1}/${longEvery}회`
      : `집중 ${state.completed}/${longEvery}회 완료`;
    el.bar.style.transform = `scaleX(${1 - state.remainingMs / state.durationMs})`;
    el.toggle.textContent = state.status === 'running' ? '일시정지'
      : state.status === 'paused' ? '재개'
      : '시작';
    el.message.textContent = state.message;
    // 창 제목(작업 표시줄)에도 남은 시간을 보여 최소화 중에도 확인할 수 있게 한다.
    document.title = `${time} ${phaseName} · 뽀모도로`;

    if (firstRender || el.fieldset.disabled !== state.inProgress) {
      el.fieldset.disabled = state.inProgress;
      el.lockNote.hidden = !state.inProgress;
      // 처음 열 때와 잠길 때만 입력란을 채운다. 입력 중인 값을 덮어쓰지 않기 위해서다.
      fillSettingsForm(state.settings);
    }
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

  // ---------- 조작 ----------

  el.toggle.addEventListener('click', () => {
    if (current?.status === 'running') api.pause();
    else api.start();
  });
  el.skip.addEventListener('click', () => api.skip());
  el.reset.addEventListener('click', () => api.reset());

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

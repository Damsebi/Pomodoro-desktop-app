(() => {
  'use strict';

  // 타이머 상태와 종료 시각 계산, 알림, 설정 저장은 메인 프로세스(main.js, timer.js)가 맡는다.
  // 이 파일은 메인에서 받은 상태를 그리고 사용자 조작을 전달한다.

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
    settings: $('settings-btn'),
  };

  const api = window.pomodoro;
  if (!api) {
    el.message.textContent = '이 화면은 뽀모도로 데스크톱 앱에서 실행해야 해요.';
    return;
  }

  let current = null;   // 메인 프로세스에서 받은 최신 상태

  // ---------- 화면 ----------
  // 실행 중에는 매초 상태가 오므로, 실제로 바뀐 값만 DOM에 써서 불필요한 스타일·레이아웃 계산을 줄인다.
  // 창 제목(작업 표시줄의 남은 시간)은 메인 프로세스가 관리한다.

  function setText(node, text) {
    if (node.textContent !== text) node.textContent = text;
  }

  function setBodyData(key, value) {
    if (document.body.dataset[key] !== value) document.body.dataset[key] = value;
  }

  let barTransform = '';

  function render(state) {
    current = state;

    const { longEvery } = state.settings;
    setBodyData('phase', state.phase);
    setBodyData('status', state.status);
    setText(el.time, state.timeText);
    setText(el.phase, PHASE_NAMES[state.phase]);
    setText(el.round, state.phase === 'focus'
      ? `집중 ${state.completed + 1}/${longEvery}회`
      : `집중 ${state.completed}/${longEvery}회 완료`);
    const transform = `scaleX(${1 - state.remainingMs / state.durationMs})`;
    if (transform !== barTransform) el.bar.style.transform = barTransform = transform;
    setText(el.toggle, state.status === 'running' ? '일시정지'
      : state.status === 'paused' ? '재개'
      : '시작');
    setText(el.message, state.message);
  }

  // ---------- 조작 ----------

  el.toggle.addEventListener('click', () => {
    if (current?.status === 'running') api.pause();
    else api.start();
  });
  el.skip.addEventListener('click', () => api.skip());
  el.reset.addEventListener('click', () => api.reset());
  el.settings.addEventListener('click', () => api.toggleSettings());
  api.onSettingsWindow((open) => {
    el.settings.setAttribute('aria-expanded', String(open));
    setText(el.settings, open ? '설정 닫기' : '설정');
  });

  // ---------- 시작 ----------

  api.onState(render);
  api.getState().then(render);
})();

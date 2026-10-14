'use strict';

const test = require('node:test');
const assert = require('node:assert/strict');
const {
  DEFAULT_SETTINGS,
  PomodoroTimer,
  applySettingsPatch,
  notificationTitle,
  sanitizeSettings,
} = require('../timer');

const MIN = 60 * 1000;
// 타이머는 종료 시각 직후(15ms)에 종료를 확인하므로, 단계를 끝낼 때는 이만큼 더 흘린다.
const END_MARGIN = 50;

// 가짜 시계와 가짜 setTimeout으로 타이머를 만든다.
function setup(overrides = {}) {
  let now = 1_700_000_000_000;
  let pending = null; // { fn, at }
  const completions = [];
  const timer = new PomodoroTimer({
    settings: { ...DEFAULT_SETTINGS, ...overrides },
    now: () => now,
    timers: {
      setTimeout: (fn, ms) => {
        pending = { fn, at: now + ms };
        return pending;
      },
      clearTimeout: (id) => {
        if (id && id === pending) pending = null;
      },
    },
    onComplete: (transitions) => completions.push(transitions),
  });
  // 시간을 흘리면서 예약된 확인을 제때 실행한다.
  function run(ms) {
    const target = now + ms;
    while (pending && pending.at <= target) {
      const { fn, at } = pending;
      pending = null;
      now = at;
      fn();
    }
    now = target;
  }
  return {
    timer,
    completions,
    run,
    // 단계 시간(분)만큼 흘려 종료 처리까지 실행한다.
    finish: (minutes) => run(minutes * MIN + END_MARGIN),
    // 절전처럼 예약된 확인이 실행되지 않은 채 시간만 흐른다.
    sleep: (ms) => {
      now += ms;
    },
    pendingCount: () => (pending ? 1 : 0),
  };
}

function view(timer) {
  const s = timer.snapshot();
  return { phase: s.phase, completed: s.completed, status: s.status, remainingSec: Math.ceil(s.remainingMs / 1000) };
}

const titles = (completions) => completions.map((list) => list.map(notificationTitle));

test('집중 4회 후 긴 휴식, 긴 휴식 뒤 새 주기', () => {
  const { timer, completions, run, finish } = setup();
  const phases = [];
  for (let i = 0; i < 4; i++) {
    timer.start();
    finish(25);
    phases.push(`${timer.phase}:${timer.completed}`);
    timer.start();
    finish(i < 3 ? 5 : 15);
    phases.push(`${timer.phase}:${timer.completed}`);
  }
  assert.deepEqual(phases, [
    'short:1', 'focus:1', 'short:2', 'focus:2', 'short:3', 'focus:3', 'long:4', 'focus:0',
  ]);
  // 단계마다 알림 1회
  assert.equal(completions.length, 8);
  assert.deepEqual(titles(completions).slice(-3), [
    ['짧은 휴식 완료 — 다음은 집중이에요.'],
    ['집중 완료 — 다음은 긴 휴식이에요.'],
    ['긴 휴식 완료 — 다음은 새 주기의 집중이에요.'],
  ]);
  assert.equal(titles(completions)[0][0], '집중 완료 — 다음은 짧은 휴식이에요.');
  assert.equal(timer.message, '긴 휴식 완료 — 새 주기의 집중 시간이에요.');
});

test('집중 횟수 1회면 첫 집중 후 바로 긴 휴식', () => {
  const { timer, run, finish } = setup({ longEvery: 1 });
  timer.start();
  finish(25);
  assert.deepEqual(view(timer), { phase: 'long', completed: 1, status: 'idle', remainingSec: 15 * 60 });
  timer.start();
  finish(15);
  assert.deepEqual(view(timer), { phase: 'focus', completed: 0, status: 'idle', remainingSec: 25 * 60 });
});

test('자동 시작이 꺼져 있으면 종료 후 대기, 알림은 한 번만', () => {
  const { timer, completions, run, finish } = setup();
  timer.start();
  finish(25);
  run(10 * MIN); // 대기 중에는 아무 일도 없어야 한다.
  assert.deepEqual(view(timer), { phase: 'short', completed: 1, status: 'idle', remainingSec: 5 * 60 });
  assert.equal(completions.length, 1);
});

test('일시정지한 시간은 차감하지 않는다', () => {
  const { timer, run, pendingCount } = setup();
  timer.start();
  run(10 * MIN);
  timer.pause();
  assert.equal(pendingCount(), 0);
  run(30 * MIN);
  assert.deepEqual(view(timer), { phase: 'focus', completed: 0, status: 'paused', remainingSec: 15 * 60 });
  timer.start();
  run(1 * MIN);
  assert.equal(view(timer).remainingSec, 14 * 60);
});

test('시작을 여러 번 눌러도 종료 시각과 예약이 하나로 유지된다', () => {
  const { timer, run, pendingCount } = setup();
  timer.start();
  const endTime = timer.endTime;
  run(3000);
  timer.start();
  timer.start();
  assert.equal(timer.endTime, endTime);
  assert.equal(pendingCount(), 1);
});

test('건너뛰기: 횟수 증가 없음, 알림 없음, 긴 휴식은 새 주기', () => {
  const { timer, completions, run, finish } = setup({ longEvery: 2 });
  timer.skip();
  assert.deepEqual(view(timer), { phase: 'short', completed: 0, status: 'idle', remainingSec: 5 * 60 });
  timer.skip();
  assert.deepEqual(view(timer), { phase: 'focus', completed: 0, status: 'idle', remainingSec: 25 * 60 });
  for (let i = 0; i < 2; i++) {
    timer.start();
    finish(25);
    if (i === 0) timer.skip();
  }
  assert.deepEqual(view(timer), { phase: 'long', completed: 2, status: 'idle', remainingSec: 15 * 60 });
  const before = completions.length;
  timer.skip();
  assert.deepEqual(view(timer), { phase: 'focus', completed: 0, status: 'idle', remainingSec: 25 * 60 });
  assert.equal(completions.length, before);
  assert.equal(timer.message, '');
});

test('자동 시작: 다음 단계가 실제 종료 시각부터 진행되고 건너뛰기에도 적용된다', () => {
  const { timer, run, sleep } = setup({ autoStart: true });
  timer.start();
  sleep(25 * MIN + 30 * 1000); // 종료 확인이 30초 늦게 실행된 경우
  timer.tick();
  assert.deepEqual(view(timer), { phase: 'short', completed: 1, status: 'running', remainingSec: 4 * 60 + 30 });
  timer.skip();
  assert.deepEqual(view(timer), { phase: 'focus', completed: 1, status: 'running', remainingSec: 25 * 60 });
  run(1000);
  assert.equal(view(timer).remainingSec, 25 * 60 - 1);
});

test('절전 복귀: 자동 시작이면 지나간 단계를 따라잡고 알림은 한 번에 모은다', () => {
  const { timer, completions, sleep } = setup({ autoStart: true });
  timer.start();
  sleep(32 * MIN); // 집중 25분 + 짧은 휴식 5분 + 2분
  timer.tick();
  assert.deepEqual(view(timer), { phase: 'focus', completed: 1, status: 'running', remainingSec: 23 * 60 });
  assert.equal(completions.length, 1);
  assert.deepEqual(titles(completions)[0], ['집중 완료 — 다음은 짧은 휴식이에요.', '짧은 휴식 완료 — 다음은 집중이에요.']);
});

test('절전 복귀: 자동 시작이 꺼져 있으면 한 단계만 끝나고 대기', () => {
  const { timer, completions, sleep } = setup();
  timer.start();
  sleep(3 * 60 * MIN);
  timer.tick();
  assert.deepEqual(view(timer), { phase: 'short', completed: 1, status: 'idle', remainingSec: 5 * 60 });
  assert.equal(completions.length, 1);
});

test('초기화: 첫 집중·0회로 돌아가고 설정은 유지', () => {
  const { timer, run, pendingCount } = setup({ focusMin: 30 });
  timer.start();
  run(31 * MIN);
  timer.reset();
  assert.deepEqual(view(timer), { phase: 'focus', completed: 0, status: 'idle', remainingSec: 30 * 60 });
  assert.equal(timer.inProgress, false);
  assert.equal(timer.message, '');
  assert.equal(pendingCount(), 0);
});

test('설정은 진행 중에 바꿀 수 없고 초기화 후 바꿀 수 있다', () => {
  const { timer } = setup();
  timer.start();
  assert.equal(timer.updateSettings({ ...DEFAULT_SETTINGS, focusMin: 50 }), false);
  timer.reset();
  assert.equal(timer.updateSettings({ ...DEFAULT_SETTINGS, focusMin: 50 }), true);
  assert.equal(view(timer).remainingSec, 50 * 60);
});

test('설정 검증', () => {
  const base = { ...DEFAULT_SETTINGS };
  for (const bad of [0, -3, 2.5, '', '1e3', 1000, null, '7a']) {
    assert.equal(applySettingsPatch(base, { focusMin: bad }), null, `focusMin=${bad}`);
  }
  assert.equal(applySettingsPatch(base, { longEvery: 100 }), null);
  assert.equal(applySettingsPatch(base, { autoStart: 'yes' }), null);
  assert.equal(applySettingsPatch(base, { unknown: 1 }), null);
  assert.deepEqual(applySettingsPatch(base, { focusMin: '30', autoStart: true }), { ...base, focusMin: 30, autoStart: true });

  assert.deepEqual(sanitizeSettings(null), DEFAULT_SETTINGS);
  assert.deepEqual(
    sanitizeSettings({ focusMin: 40, shortMin: -1, longMin: 'x', longEvery: 2, autoStart: 'true' }),
    { ...DEFAULT_SETTINGS, focusMin: 40, longEvery: 2 },
  );
});

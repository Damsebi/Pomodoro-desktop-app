'use strict';

// 뽀모도로 타이머 상태와 설정 검증. Electron에 의존하지 않아 Node만으로 테스트할 수 있다.

const DEFAULT_SETTINGS = Object.freeze({ focusMin: 25, shortMin: 5, longMin: 15, longEvery: 4, autoStart: false });
// 숫자 설정의 최댓값 (최솟값은 모두 1). index.html 입력란의 max와 맞춘다.
const LIMITS = Object.freeze({ focusMin: 999, shortMin: 999, longMin: 999, longEvery: 99 });
const PHASE_NAMES = Object.freeze({ focus: '집중', short: '짧은 휴식', long: '긴 휴식' });

function parsePositiveInt(value, max) {
  if (typeof value !== 'number' && typeof value !== 'string') return null;
  const text = String(value).trim();
  if (!/^\d+$/.test(text)) return null;
  const n = Number(text);
  return n >= 1 && n <= max ? n : null;
}

// 저장 파일에서 읽은 값: 잘못된 항목만 기본값으로 바꾼다.
function sanitizeSettings(raw) {
  const result = { ...DEFAULT_SETTINGS };
  if (raw && typeof raw === 'object') {
    for (const key of Object.keys(LIMITS)) {
      const n = parsePositiveInt(raw[key], LIMITS[key]);
      if (n !== null) result[key] = n;
    }
    if (typeof raw.autoStart === 'boolean') result.autoStart = raw.autoStart;
  }
  return result;
}

// 화면에서 받은 변경분: 하나라도 잘못되면 null을 돌려준다.
function applySettingsPatch(current, patch) {
  if (!patch || typeof patch !== 'object') return null;
  const next = { ...current };
  for (const [key, value] of Object.entries(patch)) {
    if (key in LIMITS) {
      const n = parsePositiveInt(value, LIMITS[key]);
      if (n === null) return null;
      next[key] = n;
    } else if (key === 'autoStart' && typeof value === 'boolean') {
      next.autoStart = value;
    } else {
      return null;
    }
  }
  return next;
}

function nextName({ from, to }) {
  return from === 'long' ? '새 주기의 집중' : PHASE_NAMES[to];
}

// 화면 완료 메시지 예: "집중 완료 — 짧은 휴식 시간이에요."
function screenMessage(transition) {
  return `${PHASE_NAMES[transition.from]} 완료 — ${nextName(transition)} 시간이에요.`;
}

// OS 알림 제목 예: "집중 완료 — 다음은 짧은 휴식이에요."
function notificationTitle(transition) {
  return `${PHASE_NAMES[transition.from]} 완료 — 다음은 ${nextName(transition)}이에요.`;
}

class PomodoroTimer {
  /**
   * @param {object} options
   * @param {object} [options.settings]
   * @param {() => number} [options.now] 현재 시각(ms). 실제 시계(Date.now)를 기준으로 종료 시각을 계산한다.
   * @param {{setTimeout: Function, clearTimeout: Function}} [options.timers]
   * @param {(snapshot: object) => void} [options.onUpdate] 화면 갱신이 필요할 때
   * @param {(transitions: object[]) => void} [options.onComplete] 단계 시간이 실제로 끝났을 때 (건너뛰기 제외)
   */
  constructor({
    settings = DEFAULT_SETTINGS,
    now = () => Date.now(),
    timers = { setTimeout, clearTimeout },
    onUpdate = () => {},
    onComplete = () => {},
  } = {}) {
    this.settings = { ...settings };
    this.now = now;
    this.timers = timers;
    this.onUpdate = onUpdate;
    this.onComplete = onComplete;
    this.timeoutId = null;
    this.resetState();
  }

  resetState() {
    this.phase = 'focus';        // focus | short | long
    this.completed = 0;          // 현재 주기에서 완료한 집중 횟수
    this.status = 'idle';        // idle | running | paused
    this.endTime = 0;            // running일 때 단계가 끝나는 실제 시각
    this.remainingMs = this.duration('focus'); // idle/paused일 때 남은 시간
    this.inProgress = false;     // 시작하거나 건너뛴 뒤 초기화 전까지 true → 설정 잠금
    this.message = '';
  }

  duration(phase) {
    const minutes = phase === 'focus' ? this.settings.focusMin
      : phase === 'short' ? this.settings.shortMin
      : this.settings.longMin;
    return minutes * 60 * 1000;
  }

  snapshot() {
    return {
      phase: this.phase,
      completed: this.completed,
      status: this.status,
      remainingMs: this.status === 'running' ? Math.max(0, this.endTime - this.now()) : this.remainingMs,
      durationMs: this.duration(this.phase),
      inProgress: this.inProgress,
      message: this.message,
      settings: { ...this.settings },
    };
  }

  start() {
    if (this.status === 'running') return;
    this.status = 'running';
    this.inProgress = true;
    this.endTime = this.now() + this.remainingMs;
    this.schedule();
    this.emit();
  }

  pause() {
    if (this.status !== 'running') return;
    const now = this.now();
    if (now >= this.endTime) {
      this.tick(); // 이미 끝난 단계는 종료 처리
      return;
    }
    this.remainingMs = this.endTime - now;
    this.status = 'paused';
    this.schedule();
    this.emit();
  }

  skip() {
    this.inProgress = true;
    this.message = '';
    this.advance(this.now(), false);
    this.schedule();
    this.emit();
  }

  reset() {
    this.resetState();
    this.schedule();
    this.emit();
  }

  // 초기화 상태에서만 설정을 바꿀 수 있다.
  updateSettings(next) {
    if (this.inProgress) return false;
    this.settings = { ...next };
    this.remainingMs = this.duration('focus');
    this.emit();
    return true;
  }

  // 종료 시각이 지났는지 확인한다. 절전 복귀처럼 오래 멈춰 있었다면
  // 지나간 단계를 실제 종료 시각 기준으로 차례로 처리하고, 알림은 한 번에 모아 보낸다.
  tick() {
    if (this.status !== 'running') return;
    const now = this.now();
    const transitions = [];
    while (this.status === 'running' && now >= this.endTime) {
      transitions.push(this.advance(this.endTime, true));
    }
    if (transitions.length > 0) {
      this.message = screenMessage(transitions[transitions.length - 1]);
      this.onComplete(transitions);
    }
    this.schedule();
    this.emit();
  }

  // 다음 단계로 이동한다. natural=false면 건너뛰기(완료 횟수 증가 없음).
  // 자동 시작이면 startAt 시각부터 다음 단계가 진행된 것으로 계산한다.
  advance(startAt, natural) {
    const from = this.phase;
    let to;
    if (from === 'focus') {
      if (natural) this.completed += 1;
      to = natural && this.completed >= this.settings.longEvery ? 'long' : 'short';
    } else {
      if (from === 'long') this.completed = 0;
      to = 'focus';
    }
    this.phase = to;
    if (this.settings.autoStart) {
      this.status = 'running';
      this.endTime = startAt + this.duration(to);
    } else {
      this.status = 'idle';
      this.remainingMs = this.duration(to);
    }
    return { from, to };
  }

  // 실행 중이면 표시되는 초가 바뀌는 순간(마지막에는 종료 시각) 직후에 다시 확인한다.
  schedule() {
    this.timers.clearTimeout(this.timeoutId);
    this.timeoutId = null;
    if (this.status !== 'running') return;
    const remaining = this.endTime - this.now();
    const delay = remaining > 0 ? (remaining % 1000 || 1000) + 15 : 0;
    this.timeoutId = this.timers.setTimeout(() => this.tick(), delay);
  }

  dispose() {
    this.timers.clearTimeout(this.timeoutId);
    this.timeoutId = null;
  }

  emit() {
    this.onUpdate(this.snapshot());
  }
}

module.exports = {
  DEFAULT_SETTINGS,
  LIMITS,
  PHASE_NAMES,
  PomodoroTimer,
  applySettingsPatch,
  notificationTitle,
  parsePositiveInt,
  sanitizeSettings,
  screenMessage,
};

# Pomodoro-desktop-app

최소 기능만 담긴 뽀모도로 데스크탑 앱입니다. Electron으로 만든 Windows용 프로그램이며, 설치한 뒤 아이콘을 눌러 독립된 창으로 실행합니다. 로그인·서버·통계 기능은 없습니다.

## 다운로드

### 👉 [최신 버전 다운로드 (Windows 설치 파일)](https://github.com/Damsebi/Pomodoro-desktop-app/releases/latest)

Release 페이지의 **Assets**에서 `PomodoroTimer-Setup-<버전>.exe`를 받아 실행하면 됩니다. Node.js나 Python은 필요하지 않습니다. 자세한 방법은 [설치와 실행](#설치와-실행-일반-사용자)을 참고하세요.

## 주요 기능

- **타이머 흐름**
  - 집중, 짧은 휴식, 긴 휴식 단계로 진행합니다.
  - 정해진 횟수만큼 집중하면 짧은 휴식 대신 긴 휴식으로 넘어가고, 긴 휴식이 끝나면 새 주기를 시작합니다.
  - 기본값: 집중 25분, 짧은 휴식 5분, 긴 휴식 15분, 긴 휴식 전 집중 4회
- **화면**: 남은 시간(MM:SS), 현재 단계, 회차(`집중 2/4회`, `집중 2/4회 완료`)를 보여 줍니다. 창 제목에도 남은 시간이 표시됩니다.
- **조작**
  - 시작 / 일시정지 / 재개
  - 초기화: 첫 집중, 0회로 돌아가고 설정은 유지합니다.
  - 건너뛰기: 완료 횟수를 올리지 않고, 알림도 보내지 않습니다.
- **다음 단계 자동 시작**: 켜고 끌 수 있으며, 기본은 꺼짐입니다.
- **설정**
  - 1 이상의 정수만 입력할 수 있습니다.
  - 앱을 종료했다가 다시 열어도 설정이 복원되고, 첫 집중 단계에서 대기합니다.
  - 진행 중에는 설정이 잠기고, 초기화하면 바꿀 수 있습니다.
- **종료 알림**: 단계가 끝나면 화면 메시지와 함께 소리 없는 Windows 알림(`silent: true`)을 단계마다 한 번 보냅니다. 예: `집중 완료 — 다음은 짧은 휴식이에요.`
- **정확한 시간 계산**
  - 타이머는 Electron 메인 프로세스가 실제 종료 시각을 기준으로 계산합니다.
  - 창을 최소화하거나 다른 프로그램을 쓰는 중에도 계속 동작합니다.
  - 절전에서 돌아오면 실제로 흐른 시간을 반영합니다.
- **창 동작**
  - 창을 닫으면 앱과 타이머가 함께 종료됩니다(트레이 상주 없음).
  - 앱을 한 번 더 실행하면 새 창을 만들지 않고 기존 창을 띄웁니다.
- 한국어 UI, 창 크기에 맞춘 반응형 레이아웃, 라이트/다크 모드를 지원합니다.

## 설치와 실행 (일반 사용자)

완성된 앱을 실행하는 데 **Node.js, npm, Python은 필요하지 않습니다.** Electron 런타임이 설치 파일에 포함되어 있습니다.

1. [최신 Release 페이지](https://github.com/Damsebi/Pomodoro-desktop-app/releases/latest)의 **Assets**에서 `PomodoroTimer-Setup-<버전>.exe`를 다운로드합니다.
2. 다운로드한 파일을 실행합니다.
3. 설치가 자동으로 진행됩니다.
   - 별도 질문 없이 현재 사용자 계정에 설치되고, 관리자 권한은 필요하지 않습니다.
   - 설치 위치는 `%LOCALAPPDATA%\Programs\pomodoro-timer`입니다.
4. 설치가 끝나면 앱이 실행되고, 바탕 화면과 시작 메뉴에 "뽀모도로 타이머" 바로가기가 생깁니다. 이후에는 이 아이콘을 눌러 실행합니다.

- 지원 환경: Windows 10 이상 64비트 (Windows 11에서 동작 확인)
- 설치 파일은 코드 서명이 되어 있지 않습니다. 실행할 때 "Windows의 PC 보호" 창이 나타나면 **추가 정보 → 실행**을 누르면 됩니다.
- 제거: Windows 설정 → 앱 → 설치된 앱 → 뽀모도로 타이머 → 제거
- 설정 파일 위치: `%APPDATA%\뽀모도로 타이머\settings.json`

---

## 개발자용 안내

아래 내용은 소스 코드를 수정하거나 직접 빌드하려는 개발자를 위한 것입니다. 앱을 사용하기만 한다면 위의 [설치와 실행](#설치와-실행-일반-사용자)만 보면 됩니다.

### 개발 환경 준비와 실행

- Windows 10/11 x64 (Windows 11에서 확인)
- Node.js 24 LTS와 npm
- Electron 44, electron-builder 26 (`package.json`의 `devDependencies`)

```bash
git clone https://github.com/Damsebi/Pomodoro-desktop-app.git
cd Pomodoro-desktop-app
npm install      # Electron, electron-builder 설치
npm start        # 개발 모드로 앱 실행
npm test         # 타이머 로직 단위 테스트 (node:test)
```

Electron 바이너리는 `npm start`를 처음 실행할 때 내려받습니다.

### 빌드

```bash
npm run dist
```

`electron-builder --win nsis --x64`를 실행해 다음 파일을 만듭니다.

| 결과물 | 설명 |
| --- | --- |
| `dist/PomodoroTimer-Setup-<버전>.exe` | 배포용 설치 파일. 사용자별·원클릭 NSIS 설치 프로그램 |
| `dist/win-unpacked/` | 설치하지 않은 앱 폴더. 빌드 확인용 |

빌드 설정은 `package.json`의 `build` 항목에 있습니다.

- 앱 ID `com.ppomodoro.desktop`, 제품 이름 `뽀모도로 타이머`, 실행 파일 이름 `PomodoroTimer.exe`
- 아이콘 `build/icon.png`, 버전은 `package.json`의 `version`을 따릅니다.
- 앱에 포함되는 파일: `main.js`, `preload.js`, `timer.js`, `index.html`, `style.css`, `app.js`

**참고**
- 처음 빌드할 때 electron-builder가 Electron 압축본, NSIS 등 빌드 도구를 내려받으므로 인터넷 연결이 필요합니다.
- 코드 서명 인증서는 설정하지 않았습니다. 서명하려면 electron-builder의 Windows 서명 설정을 추가해야 합니다.
- Windows 알림은 앱 ID와 시작 메뉴 바로가기를 기준으로 앱 이름과 아이콘을 표시합니다. 그래서 개발 모드(`npm start`)는 별도 ID(`com.ppomodoro.desktop.dev`)를 씁니다. 같은 ID를 쓰면 Windows가 개발용 실행 파일 정보를 기억해 설치본 알림에 "Electron"이 표시될 수 있습니다.
- `dist/win-unpacked/PomodoroTimer.exe`를 설치 없이 실행하면 시작 메뉴 바로가기가 없어 알림이 정상적으로 표시되지 않을 수 있습니다. 배포에는 설치 파일을 사용하세요.
- 설치 파일은 Git에 커밋하지 않습니다(`.gitignore`에서 `dist/` 제외). [GitHub Releases](https://github.com/Damsebi/Pomodoro-desktop-app/releases)에 `v<버전>` 태그로 Release를 만들어 첨부 파일로 배포합니다.

### 프로젝트 구조

| 파일 | 역할 |
| --- | --- |
| `main.js` | 메인 프로세스: 창, IPC, OS 알림, 설정 파일 저장, 절전 복귀 처리 |
| `timer.js` | 타이머 상태와 종료 시각 계산, 설정 검증 (Electron 비의존) |
| `preload.js` | 화면에 노출하는 API (`window.pomodoro`) |
| `index.html`, `style.css`, `app.js` | 화면 표시와 입력 |
| `build/icon.png` | 앱·설치 파일 아이콘 |
| `test/timer.test.js` | 타이머 로직 단위 테스트 |

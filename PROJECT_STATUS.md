# SkyClip 프로젝트 상태

## 기본 정보

- 작업 폴더: `C:\Users\stkim\Documents\Codex\skyclip`
- 목적: 피카클립 수준의 AI 숏폼 제작 서비스 프로토타입
- 기술: Vanilla HTML/CSS/JavaScript + Node.js + FFmpeg
- UI 언어: 한국어 중심
- 현재 날짜: 2026-10-30

## 완료된 기능

- 스튜디오 대시보드, 프로젝트, 템플릿, 에셋 화면
- 영상 링크 입력 및 로컬 영상 업로드/드래그앤드롭
- 영상 미리보기와 9:16 편집 화면
- 자막 편집, 자막 구간 시간 수정, 자막 재생성 API
- 컷 후보 지정, 컷 마커 드래그, 실행 취소/다시 실행
- 키보드 단축키: Space 재생, C 컷, Ctrl+Enter 내보내기, Ctrl+Z/Shift+Z
- 자막 스타일 미리보기 효과
- 오디오 선택, 오디오 파일 추가, 볼륨 조절, 로컬 렌더 오디오 합성
- IndexedDB 기반 영상/에셋 저장
- 프로젝트 로그, 알림 패널, 크레딧 잔액/사용 기록
- Node API와 FFmpeg MP4 렌더 큐
- 실패 작업 환불/재시도
- 반응형 모바일 레이아웃
- 한글 UI 정리

## 검증 상태

`npm run qa` 통과:

- 문법 검사
- 자막 편집
- 컷 저장
- 프로젝트 API
- 자막 API
- 내보내기 API
- FFmpeg 렌더러
- API 스모크 테스트 코드(`npm run verify:api`)

## 실행 방법

PowerShell에서:

```powershell
& "C:\Users\stkim\Documents\Codex\skyclip\start.cmd"
```

그 다음 일반 Chrome에서 `http://localhost:8791` 접속.

또는:

```powershell
cd C:\Users\stkim\Documents\Codex\skyclip
npm run qa
npm start
```

## 현재 제한

- Codex 인앱 브라우저는 로컬 `localhost` 서버 연결이 불안정하거나 차단될 수 있음
- 실제 브라우저 수동 QA는 일반 Chrome에서 수행해야 함
- 외부 STT/Whisper, 인증, 영구 파일 저장소, 결제, 실제 클라우드 배포는 아직 연결하지 않음

## 다음 작업

1. 일반 Chrome에서 샘플 영상 → 편집기 → 자막/컷/오디오 → 내보내기 수동 QA
2. 실제 Whisper/STT 연결
3. 오디오/영상 파일 영구 저장소 연결
4. 인증·프로젝트 사용자별 데이터 분리
5. 클라우드 배포 및 운영 모니터링

## 주요 파일

- `index.html`: 화면 구조
- `styles.css`: 스타일/반응형
- `app.js`: 브라우저 편집 기능
- `server.mjs`: API/프로젝트 저장/렌더 큐
- `render.mjs`: FFmpeg 렌더 CLI
- `verify.mjs`: 자동 검증
- `QA_CHECKLIST.md`: 수동 QA 항목
- `README.md`: 실행 및 기능 설명

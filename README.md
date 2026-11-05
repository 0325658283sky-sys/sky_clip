# SkyClip prototype

피카클립을 참고한 독립적인 AI 숏폼 제작 서비스의 첫 번째 제품 골격입니다.

## 현재 구현된 흐름

- Studio 홈: 영상 링크 입력, 샘플 영상 시작, 프로젝트 목록
- Editor 화면: 세로형 영상 미리보기, 씬 타임라인, 스크립트 기반 편집
- Captions: 자막 스타일 선택
- Audio: BGM 선택
- Projects / Templates / Asset library: 제품 구조를 확인할 수 있는 작업 화면
- 실제 업로드/드래그앤드롭과 브라우저 영상 프리뷰
- 스크립트 기반 자막 편집, 자막 큐 시간 수정, 컷 구간 지정
- 로컬 IndexedDB 자산 저장, 프로젝트/템플릿/자산 검색과 관리
- 알림 패널, 크레딧 사용 기록, 서버 프로젝트 로그
- Node API와 FFmpeg 기반 MP4 렌더 큐, 브라우저 로컬 WebM 내보내기
- 오디오 트랙 선택과 볼륨 설정을 내보내기 매니페스트에 저장

## 실행

정적 화면만 확인하려면 `index.html`을 브라우저에서 열 수 있습니다. API와 렌더 큐까지 사용하려면 프로젝트 폴더에서 다음처럼 실행합니다.

```powershell
node server.mjs
```

또는 `npm start`를 실행하면 같은 API 서버가 시작됩니다.

서버가 이미 실행 중인지 확인하면서 안정적으로 시작하려면 다음 명령을 사용합니다.

```powershell
npm run start:stable
```

브라우저 QA는 `start.cmd` 실행 후 같은 PC의 브라우저에서 `http://localhost:8791`을 열어 진행합니다.

PowerShell 위치와 관계없이 실행하려면 다음 명령을 사용합니다.

```powershell
& "C:\Users\stkim\Documents\Codex\skyclip\start.cmd"
```

그 다음 `http://localhost:8787`을 엽니다.

## 검증

```powershell
npm run verify
```

전체 API 통합검사까지 실행하려면 다음 명령을 사용합니다.

```powershell
npm run verify:api
```

전체 게이트(기본 QA + API + 외부 STT + 서명 인증)를 한 번에 실행하려면:

```powershell
npm run qa:full
```

외부 STT를 연결할 때는 `.env.example`의 계약을 기준으로 `SKYCLIP_STT_URL`을 설정합니다. 설정하지 않으면 현재 로컬 분석 폴백으로 안전하게 동작합니다.

운영 환경에서는 `SKYCLIP_WORKSPACE_SECRET`을 설정하면 워크스페이스 쿠키를 서명 검증하는 모드로 전환됩니다. 이는 외부 로그인 제공자를 대체하지 않으며, 개발용 workspace 모드와 분리된 추가 경계입니다.

자막 편집, 컷 저장, 프로젝트/자막/내보내기 API, FFmpeg 렌더러를 자동 점검합니다.

## 다음 구현 순서

1. 실제 Whisper/STT 서비스 연결
2. 인증과 영구 파일 저장소 연결
3. GPU 렌더 워커와 작업 큐 분리
4. 실제 오디오 파일 업로드·FFmpeg 믹싱 연결
5. 결제/크레딧 정책과 운영 모니터링 추가

운영 전환 잔여 항목은 `PRODUCTION_GAPS.md`에 정리되어 있습니다.


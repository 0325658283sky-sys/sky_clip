# SkyClip prototype

REA 관찰 범위를 바탕으로 만든 독립적인 AI 숏폼 제작 서비스의 클린룸 구현입니다.

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
- YouTube 및 직접 영상 링크(`mp4/mov/webm`) 원본 확보
- 실제 9:16 클립 MP4 추출, 장면 변화·자막 기반 분석, 외부 하이라이트 모델 어댑터
- 결과 클립 Range 재생, 자막·후킹 합성, 선택 클립 편집기 연결
- 화이트 제품 테마와 분석 방식 상태 표시

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

전체 게이트(기본 QA + API + 실제 미디어 + 외부 STT/하이라이트 + 서명 인증)를 한 번에 실행하려면:

```powershell
npm run qa:full
```

외부 STT를 연결할 때는 `.env.example`의 계약을 기준으로 `SKYCLIP_STT_URL`을 설정합니다. 설정하지 않으면 현재 로컬 분석 폴백으로 안전하게 동작합니다.

외부 하이라이트 모델은 `SKYCLIP_HIGHLIGHT_URL`을 설정합니다. 모델은 `clips[]`에 `start`, `end`, `title`, `viralScore`, `scoreReason`, `subtitleText`를 반환해야 하며, 연결 실패 시 로컬 장면·자막 분석으로 폴백합니다.

운영 환경에서는 `SKYCLIP_WORKSPACE_SECRET`을 설정하면 워크스페이스 쿠키를 서명 검증하는 모드로 전환됩니다. 이는 외부 로그인 제공자를 대체하지 않으며, 개발용 workspace 모드와 분리된 추가 경계입니다. 배포 모니터링은 `/api/health`(프로세스 생존)와 `/api/ready`(상태 파일·볼륨·FFmpeg·FFprobe 준비)를 구분해 사용합니다.

## 컨테이너 운영

Docker가 설치된 환경에서는 `.env`를 만든 뒤 `docker compose up -d --build`로 실행할 수 있습니다. 영상·렌더·상태 파일은 `skyclip-data` 영구 볼륨에 저장되며, 운영 모니터링은 `/api/ready`를 사용합니다. 실제 운영 전에는 `.env`의 인증·STT·하이라이트 비밀값을 반드시 설정해야 합니다.

배포 직전에는 `npm run verify:config -- --production`으로 필수 운영 설정을 확인합니다. 개발 모드에서는 인증·AI 공급자 없이 로컬 폴백으로 실행되며, 운영 모드에서는 `SKYCLIP_WORKSPACE_SECRET`이 필수입니다.

자막 편집, 컷 저장, 프로젝트/자막/내보내기 API, 실제 1080x1920 클립 파일, FFmpeg 렌더러를 자동 점검합니다.

## 다음 구현 순서

1. 실제 Whisper/STT 서비스 연결
2. 인증과 영구 파일 저장소 연결
3. GPU 렌더 워커와 작업 큐 분리
4. 실제 오디오 파일 업로드·FFmpeg 믹싱 연결
5. 결제/크레딧 정책과 운영 모니터링 추가

운영 전환 잔여 항목은 `PRODUCTION_GAPS.md`에 정리되어 있습니다.
완료 근거와 외부 인프라 잔여 범위는 `COMPLETION_AUDIT.md`에서 추적합니다.


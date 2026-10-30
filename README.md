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

자막 편집, 컷 저장, 프로젝트/자막/내보내기 API, FFmpeg 렌더러를 자동 점검합니다.

## 다음 구현 순서

1. 실제 Whisper/STT 서비스 연결
2. 인증과 영구 파일 저장소 연결
3. GPU 렌더 워커와 작업 큐 분리
4. 실제 오디오 파일 업로드·FFmpeg 믹싱 연결
5. 결제/크레딧 정책과 운영 모니터링 추가


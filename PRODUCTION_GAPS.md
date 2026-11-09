# 운영 전환 잔여 항목

현재 SkyClip은 REA 관찰 결과를 기반으로 실제 원본·클립·렌더 흐름을 검증하는 클린룸 구현 단계다. 다음 항목은 코드 내부에서 추가 보완할 부분과 외부 운영 인프라 연결이 함께 필요하다.

## 1. 외부 인증

- 실제 OAuth/OIDC 제공자 선택
- 제공자의 사용자 ID를 `workspaceId`로 매핑
- `SKYCLIP_WORKSPACE_SECRET` 기반 서명 세션 발급을 인증 콜백에 연결
- 현재는 서명 워크스페이스 모드와 개발용 workspace 모드를 제공한다.

## 2. STT/AI 공급자

- `.env.example`의 `SKYCLIP_STT_URL`과 `SKYCLIP_STT_TOKEN` 설정
- 게이트웨이는 `file` multipart 필드와 `captions`, `captionCues` 응답 계약을 준수해야 한다.
- 연결 실패 시 로컬 분석 폴백과 로그 기록이 동작한다.
- 하이라이트 모델은 `SKYCLIP_HIGHLIGHT_URL`에 JSON 계약(`clips[]`의 `start`, `end`, `title`, `viralScore`, `scoreReason`, `subtitleText`)을 제공하면 연결된다.
- 선택적으로 `focusX`, `focusY`(0~1)를 반환하면 이후 얼굴 중심 자동 리프레이밍 워커에서 사용할 수 있다.

## 3. 영구 저장소

- `SKYCLIP_UPLOAD_DIR`, `SKYCLIP_RENDER_DIR`를 영구 볼륨 또는 오브젝트 스토리지 워커에 연결
- 현재는 로컬 디렉터리 기반이며 원자적 JSON 저장과 실패 파일 정리를 제공한다.

## 4. 운영 배포

- FFmpeg/yt-dlp가 포함된 워커 이미지 구성
- HTTPS, 비밀키 관리, 로그 수집, 작업 큐와 재시도 정책 연결
- 배포 전 `npm run qa:full` 실행

## 5. 연결 순서

1. STT 게이트웨이와 하이라이트 게이트웨이에 운영 URL·토큰 설정
2. OAuth/OIDC 콜백에서 사용자 ID를 서명 워크스페이스로 매핑
3. 업로드·렌더 디렉터리를 영구 볼륨 또는 오브젝트 스토리지 워커로 교체
4. FFmpeg 워커와 큐를 분리한 뒤 `npm run qa:full`과 실제 MP4 회귀 테스트 실행

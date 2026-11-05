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

## 3. 영구 저장소

- `SKYCLIP_UPLOAD_DIR`, `SKYCLIP_RENDER_DIR`를 영구 볼륨 또는 오브젝트 스토리지 워커에 연결
- 현재는 로컬 디렉터리 기반이며 원자적 JSON 저장과 실패 파일 정리를 제공한다.

## 4. 운영 배포

- FFmpeg/yt-dlp가 포함된 워커 이미지 구성
- HTTPS, 비밀키 관리, 로그 수집, 작업 큐와 재시도 정책 연결
- 배포 전 `npm run qa:full` 실행

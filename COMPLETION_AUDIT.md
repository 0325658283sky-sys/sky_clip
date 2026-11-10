# SkyClip 완료 감사

## 달성된 범위

| 요구 영역 | 근거 |
|---|---|
| REA 기반 클린룸 분석 | `REA_SPEC.md`, `CLEANROOM_PROVENANCE.md` |
| 영상 입력·분석·결과 클립 | `server.mjs`, `app.js`, `verify-api.mjs` |
| 자막·컷·템플릿·에셋·오디오 | `verify.mjs`, `verify-api.mjs` |
| 9:16/1:1/16:9 렌더링 | `server.mjs`, `app.js`, export-range 검사 |
| 공유·프로젝트 관리·재시도 | `app.js`, 프로젝트 API 검사 |
| 샘플 결과를 내 프로젝트로 복제 | `/api/projects/sample`, 샘플 버튼 흐름 |
| 외부 STT 선택 연결 | `verify-stt.mjs`, `.env.example` |
| 서명 워크스페이스 경계 | `verify-auth.mjs`, `SKYCLIP_WORKSPACE_SECRET` |
| 저장소 경로 분리 | `verify-storage.mjs`, `SKYCLIP_UPLOAD_DIR`, `SKYCLIP_RENDER_DIR` |
| 자동 검증 | `npm run qa:full` |

## 최근 런타임 검증 기록

- `npm run qa:full` 전체 통과: API, 실제 FFmpeg 클립, 1080×1920 출력, STT/하이라이트 어댑터, 인증 경계, 저장소, 프롬프트 클립
- 샘플 영상 실제 길이 probe 및 추천 클립 `previewUrl` 생성 확인
- 선택 구간 MP4 내보내기 완료 상태와 `exportProgress: 100` 확인

## 외부 인프라가 필요한 잔여 범위

- 실제 OAuth/OIDC 제공자와 사용자 계정 매핑
- 실제 STT/AI 게이트웨이 운영 키와 배포
- 오브젝트 스토리지·GPU 렌더 워커·작업 큐
- HTTPS·비밀 관리·모니터링·결제 운영

상기 잔여 범위는 코드만으로 완료할 수 없는 외부 계정·인프라 연결 항목이며, 상세 절차는 `PRODUCTION_GAPS.md`에 기록한다.

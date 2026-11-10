# SkyClip 운영 전환 런북

## 1. 환경 준비

`.env.example`을 `.env`로 복사하고 `SKYCLIP_WORKSPACE_SECRET`, STT URL/token, 하이라이트 URL/token을 운영값으로 설정한다.

```bash
npm run verify:config -- --production
```

## 2. 컨테이너 실행

```bash
docker compose up -d --build
curl http://localhost:8787/api/health
curl http://localhost:8787/api/ready
```

`/api/ready`의 `ready`가 `true`여야 한다.

## 3. 연결 확인

`/api/capabilities`에서 `sttConfigured`, `highlightConfigured`, `workspaceAuthConfigured`를 확인한다. 외부 연결 실패 시 로컬 분석 폴백이 동작하며 서버 로그에 원인이 기록된다.

## 4. 회귀 테스트

```bash
npm run qa
npm run verify:media
npm run verify:stt
npm run verify:highlight
npm run verify:auth
npm run verify:storage
```

OAuth callback에서 사용자 ID를 서명 workspace로 매핑하고, 멀티 인스턴스 운영 시 `/data`를 공유 스토리지와 FFmpeg 큐/워커로 교체한다.

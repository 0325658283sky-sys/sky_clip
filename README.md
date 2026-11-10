# SkyClip

FikaClip의 사용자 관점 흐름을 REA로 관찰한 뒤 독립적으로 재구성하는 로컬 영상 작업공간입니다.

## 현재 상태

- REA 관찰 근거: `REA_FIKACLIP_ANALYSIS.md`
- 독립 구현 명세: `CLEANROOM_SPEC.md`
- 현재 구현: 대시보드, 링크/파일 입력, 서버 파일 저장, ffprobe 메타데이터, FFmpeg 클립 추출, 실제 미디어 미리보기, MP4 내보내기 호출, 결과/편집기/템플릿/에셋 흐름
- 다음 구현: 자막 파이프라인, 편집 상태 모델, 타임라인 조작과 결과 클립별 렌더링

## 실행

```powershell
npm start
```

미디어 파이프라인 검증:

```powershell
node scripts/verify-local.mjs test-e2e.mp4
```

포트 8787이 이미 사용 중이면 기존 서버를 재사용하거나 ` $env:PORT=8788; npm start `로 다른 포트를 사용할 수 있습니다.

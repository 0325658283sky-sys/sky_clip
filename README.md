# SkyClip

FikaClip의 사용자 관점 흐름을 REA로 관찰한 뒤 독립적으로 재구성하는 로컬 영상 작업공간입니다.

## 현재 상태

- REA 관찰 근거: `REA_FIKACLIP_ANALYSIS.md`
- 독립 구현 명세: `CLEANROOM_SPEC.md`
- 현재 구현: 대시보드, 링크/파일 입력, 서버 파일 저장, ffprobe 메타데이터, FFmpeg 클립 추출, 실제 미디어 미리보기, MP4 내보내기, 결과/편집기/템플릿/에셋 흐름, faster-whisper 자동 자막
- 다음 구현: 자막 스타일 렌더링, 실제 음성 기반 분석 점수, 레이어/템플릿/에셋의 최종 영상 반영

## 실행

```powershell
npm start
```

미디어 파이프라인 검증:

```powershell
node scripts/verify-local.mjs test-e2e.mp4
```

포트 8787이 이미 사용 중이면 기존 서버를 재사용하거나 ` $env:PORT=8788; npm start `로 다른 포트를 사용할 수 있습니다.

STT 의존성 설치:

```powershell
python -m pip install -r requirements-stt.txt
```

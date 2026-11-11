# SkyClip 외부 AI 공급자 연결

SkyClip은 API 키나 공급자 URL이 없는 경우 번역·생성형 미디어 결과를 만들지 않는다. 편집기에서 연결 상태를 확인할 수 있으며, 미연결 기능을 실행하면 오류를 사용자에게 그대로 표시한다.

## 번역

`SKYCLIP_TRANSLATION_URL`에 JSON HTTP endpoint를 설정한다.

요청 본문은 다음 형식이다.

```json
{
  "targetLanguage": "en",
  "captions": [{ "start": 0, "end": 2, "text": "..." }]
}
```

응답은 `captions` 또는 `translations` 배열을 반환해야 한다. 성공한 자막은 VTT, 선택 클립, 다음 MP4 내보내기에 저장된다.

## 생성형 미디어

`SKYCLIP_MEDIA_API_URL`에 이미지·음성·음악·효과음 요청을 받을 endpoint를 설정한다. SkyClip은 `kind`, `prompt`, `clipId`를 JSON으로 전송한다.

공급자의 실제 에셋 저장 형식과 인증 방식은 아직 프로젝트에 설정되지 않았다. URL 또는 키를 제공받으면 결과 에셋을 로컬 보관함과 트랙에 저장하는 연결 작업을 진행한다.

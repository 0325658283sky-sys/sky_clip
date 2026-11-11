# SkyClip 외부 AI 공급자 연결

SkyClip은 API 키나 공급자 URL이 없는 경우 번역·생성형 미디어 결과를 만들지 않는다. 편집기에서 연결 상태를 확인할 수 있으며, 미연결 기능을 실행하면 오류를 사용자에게 그대로 표시한다.

## 번역

`SKYCLIP_TRANSLATION_URL`에 JSON HTTP endpoint를 설정한다. Bearer 인증이 필요하면 `SKYCLIP_TRANSLATION_TOKEN`을 함께 설정한다.

요청 본문은 다음 형식이다.

```json
{
  "targetLanguage": "en",
  "captions": [{ "start": 0, "end": 2, "text": "..." }]
}
```

응답은 `captions` 또는 `translations` 배열을 반환해야 한다. 성공한 자막은 VTT, 선택 클립, 다음 MP4 내보내기에 저장된다.

## 생성형 미디어

`SKYCLIP_MEDIA_API_URL`에 이미지·음성·음악·효과음 요청을 받을 endpoint를 설정한다. Bearer 인증이 필요하면 `SKYCLIP_MEDIA_API_TOKEN`을 함께 설정한다. SkyClip은 `kind`, `prompt`, `clipId`, 선택적 `trackId`를 JSON으로 전송한다.

성공 응답은 `assetUrl`, `url`, 또는 `asset.url` 중 하나에 HTTP(S) 다운로드 URL을 포함해야 한다. 선택적으로 `kind`에 `image`, `video`, `audio`를 반환할 수 있다.

SkyClip은 공급자 요청을 최초 실패 시 한 번 재시도한다. 성공한 원격 파일은 로컬 에셋 보관함에 저장되고 선택 트랙(없으면 호환되는 새 트랙)에 연결된다. 공급자 미설정은 `503`과 `retryable: false`, 일시적 공급자/다운로드 실패는 `502`와 `retryable: true`로 응답한다. URL·토큰은 API 응답이나 프로젝트 파일에 저장하지 않는다.

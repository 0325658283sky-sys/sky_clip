# SkyClip API 초안

## 상태 확인

`GET /api/health`

```json
{ "ok": true, "service": "skyclip" }
```

## 프로젝트 생성

`POST /api/projects`

```json
{ "title": "새 프로젝트", "source": "https://example.com/video" }
```

생성 직후 `queued` 상태로 반환하고, 처리 완료 시 `ready`로 전환한다. 실제 구현에서는 이 처리 위치에 영상 다운로드, 음성 인식, 하이라이트 분석, 렌더 작업 큐를 연결한다.

## 프로젝트 목록

`GET /api/projects`

프로젝트 ID, 제목, 원본, 처리 상태, 진행률, 생성 시각을 반환한다.

## 프로젝트 상세

`GET /api/projects/:id`

편집기 진입 전에 처리 상태를 확인한다. `queued`, `processing`, `ready`, `failed` 상태를 사용한다.
## 추천 클립 결과

`GET /api/projects/:id/results`

분석이 완료된 프로젝트의 결과 후보를 반환한다. 하나의 원본에서 여러 숏폼 후보를 탐색할 수 있도록 한다.

```json
{
  "projectId": "...",
  "status": "ready",
  "resultSet": {
    "sourceVideo": { "title": "...", "source": "..." },
    "clips": [
      {
        "id": "...-clip-01",
        "title": "...",
        "duration": "00:50",
        "viralScore": 99,
        "scoreReason": "...",
        "subtitleText": "...",
        "start": 0,
        "end": 50
      }
    ]
  }
}
```

`POST /api/projects/:id/export`는 `clipStart`, `clipEnd`를 선택적으로 받아 해당 구간만 FFmpeg로 렌더링한다.

## 분석 상태

`GET /api/projects/:id/analysis`

분석 제공자와 현재 단계(`queued`, `transcribing`, `scoring`, `ready`), 자막 준비 여부, 하이라이트 준비 여부를 반환한다. 현재 기본 제공자는 외부 키 없이 동작하는 `local` fallback이며, 외부 STT/하이라이트 제공자는 `SKYCLIP_ANALYSIS_PROVIDER`로 교체할 수 있다.
## 원본 영상 업로드

`POST /api/projects/:id/source`

영상 파일을 요청 본문으로 보내고 `x-file-name` 헤더에 원본 파일명을 전달한다. 서버는 `renderInput`을 저장해 이후 선택 구간 렌더링에 사용한다.

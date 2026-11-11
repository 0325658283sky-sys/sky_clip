# SkyClip 기능·데이터 명세 v2

## 골인 정의

회원가입·로그인·결제를 제외하고, 사용자가 FikaClip과 같은 순서로 영상을 입력하고 결과를 확인하고 편집하고 다운로드할 수 있어야 한다. 각 기능은 화면 존재가 아니라 실제 영상 결과와 재진입 상태까지 검증해야 완료다.

## 핵심 데이터

```text
Project
  id, source, sourceType, fileName, status, progress, metadata
  clips[], previewUrl, selectedClipId, captions, captionUrl
  edit, editHistory, editFuture, exportUrl, updatedAt

Clip
  id, start, end, duration, title, score, scoreType
  scoreBreakdown, captions, ready, aspectRatio
  previewUrl, sourcePreviewUrl, thumbnailUrl

Edit
  start, end, segments[], layers[], effects[]
  captionStyle, templateId, assetId, tool
```

## 기능 계약

| 기능 | 입력 | 성공 결과 |
|---|---|---|
| 프로젝트 생성 | 파일 또는 공개 영상 링크 | Project와 실제 원본 파일 생성 |
| 분석 | ready Project | 장면 변화 후보를 우선 선택한 9:16 준비 Clip 목록과 실제 MP4 생성 |
| 클립 선택 | clipId | previewUrl·captions·title·export 대상 변경 |
| 자막 편집 | captions[] | VTT 저장과 미리보기/내보내기 반영 |
| 제목 편집 | title | 캔버스와 텍스트 레이어에 반영 |
| 타임라인 편집 | segments[] | 재생·구간·내보내기 순서 반영 |
| 텍스트 레이어 | layers[] | FFmpeg drawtext로 MP4 반영 |
| 스타일 | captionStyle | 자막 위치·크기·색상에 반영 |

자막 재생성은 편집 중인 선택 클립의 원본 MP4를 우선 입력으로 사용한다. 따라서 이전 분석에서 저장된 깨진 문자열을 그대로 재사용하지 않고, 현재 클립에 맞는 새 VTT와 `captions[]`를 함께 저장한다.
| 내보내기 | 현재 Edit 상태 | 다운로드 가능한 MP4와 HTTP 응답 |

## 단계별 완료 판정

1. 분석·관찰 문서에 근거가 있다.
2. 기능 계약과 상태 전이가 고정되어 있다.
3. 실제 영상 파일로 성공·실패 상태를 재현할 수 있다.
4. 결과 Clip이 실제 미디어 파일을 가리킨다.
5. 선택 Clip이 편집·내보내기 전체에 유지된다.
6. 편집 도구가 Project.edit를 변경한다.
7. 타임라인 변경이 저장되고 재진입 후 유지된다.
8. MP4를 생성하고 결과를 재생·다운로드할 수 있다.
9. FikaClip 동일 흐름 비교표에서 미통과 항목이 없다.
10. 자동 검증·문서·커밋·릴리스 상태가 일치한다.

## 미확인으로 유지할 항목

- FikaClip 내부 AI 모델과 점수 산정 공식
- FikaClip 내부 API 요청/응답의 비공개 구조
- 관찰하지 않은 생성형 이미지·음악·음성의 품질 기준

분석 후보는 로컬 FFmpeg 장면 변화 검출을 우선 사용하고, 후보가 부족할 때만 균등 시간 구간을 보조로 사용한다. 이는 의미 기반 AI와 동일하다고 주장하지 않으며, 최종 비교 검증 전까지 `heuristic` 상태로 표시한다.

이 항목들은 추측 구현으로 완료 처리하지 않고, SkyClip의 독립 구현 경계로 남긴다.

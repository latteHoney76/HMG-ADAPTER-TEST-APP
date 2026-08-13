# HMG HTML PRO 마이그레이션 프로젝트 — 진행 정리 (2026-08-13 시점)

Claude Code에서 이어서 작업하실 때 참고할 수 있도록 지금까지의 논의와
산출물을 정리했습니다.

---

## 1. 배경

DC(온프레미스) Confluence의 `<ac:structured-macro ac:name="html">` (html
매크로)를 Cloud의 **HMG HTML PRO** Forge 앱(매크로 key: `forgeh-dj-html`)
으로 이관하는 작업. OSC(협력사)가 변환 스크립트를 작성해 1차 이관을
완료했고, 그 과정에서 발견된 이슈들을 HMG 담당자(김동진 책임매니저)와
Q&A로 확인해왔음.

## 2. HMG HTML PRO 앱 구조 (HMG 답변 기준, 2026-08-04)

| 항목 | 내용 |
|---|---|
| App ID | `ari:cloud:ecosystem::app/6c452096-f09e-4786-b309-8120c07c2894` |
| Macro Key | `forgeh-dj-html` |
| 저장 방식 | `@forge/kvs` (storage.get/set 아님) |
| 저장 구조 | Confluence 페이지에는 Macro+`contentId`만 기록, 실제 HTML/CSS는 KVS에 저장 |
| KVS Key 패턴 | `forgeh:<contentId>:<kind>:<chunkIndex>` 등 |
| Web Trigger | `forgeh-migration-import` (migration-gateway.handler) — 실제 운영 URL 존재. `forgeh-cloud-import-trigger`는 배포만 되고 URL 미생성 |
| 저장 프로토콜 | `begin → chunk(0..N) → commit`, 인증은 `Authorization: Bearer {FORGEH_MIGRATION_SECRET}` |
| **⚠️ Script 처리** | 일반 저장 및 Migration Gateway 경로 **둘 다 `<script>` 태그를 통째로 제거함** (외부 import든 inline이든 구분 없음). V22/v24 계열만 `source-html`에 원본 보존 가능 |
| CSP | Production에 반영됨, 현재는 도메인 화이트리스트가 아니라 `*` 전체 허용 |
| REST 연동 | Backend Resolver에 `asUser()/asApp().requestConfluence()` 구현되어 있으나, **iframe 내부 스크립트가 직접 쓸 수 있는 범용 postMessage Adapter/Proxy는 미구현** (2026-08 시점 확인) |
| 현재 Scope (7개) | `read:confluence-content.all`, `read:confluence-content.permission`, `read:confluence-user`, `read:page:confluence`, `storage:app`, `write:confluence-content`, `write:page:confluence` — `read:content:confluence`, `read:content-details:confluence`, `write:content.property:confluence`는 **미포함** |

## 3. 마이그레이션 스크립트 검토 (`hmg_migrate_page_ver_0019.py`)

OSC가 작성한 `begin/chunk/commit` 기반 이관 스크립트를 리뷰함. 전반적으로
스펙 준수, retry/DRY_RUN/진행상황 저장 등 안전장치가 잘 되어 있음. 단:

- **가장 중요한 리스크**: 이 스크립트가 쓰는 `forgeh-migration-import`가
  저장 시 `<script>`를 제거하므로, 원본 DC html 매크로에 JS(외부/inline)가
  있었다면 **눈으로는 안 보이지만 그 기능이 사라졌을 가능성이 높음**.
  → 이관된 페이지 중 원본에 `<script>`가 있던 것만 골라서 실제 동작 여부
    재확인 필요 (HMG의 `safe-read-v19` 경로로 `source-html` 레코드 대조 요청도 가능)
- 부수 확인 사항: migration용 API 토큰 계정의 accountId가
  `embedded-macro-context`에 기록되는 점, `WORKSPACE_ID` 고정값 가정
  (스크립트 자체에 "HMG 미확인"으로 이미 표시돼 있음)

## 4. REST API 사용 html 매크로 (실사용 예시 페이지) 분석

업로드된 실제 HTML(`html_macro_에서_rest_api_를_사용한_html_원문.html`,
PM 업무분장 페이지)을 분석한 결과:

- DC 서버(`https://confluence.hmg-corp.io`)에 **same-origin 세션 쿠키
  인증**으로 직접 `fetch()` 호출하는 구조
- content property(GET/POST/PUT), 페이지 body 조회, child page 목록,
  사용자 검색, `/rest/api/user/current`, **`/display/~username` 프로필
  페이지 HTML 스크래핑(이메일 추출)** 등을 사용
- Cloud/Forge 환경에서 그대로 동작 불가한 이유 4가지:
  1. 저장 시 `<script>` 자체가 제거됨
  2. DC 도메인 하드코딩
  3. 쿠키 기반 인증이 sandboxed iframe에서 통하지 않음 (CORS/격리)
  4. Forge는 애초에 iframe의 임의 REST 직접호출을 허용하지 않는 설계
- **content property를 쓰는 이 페이지 로직 자체는 `read:content:confluence`,
  `write:content.property:confluence` 같은, HMG가 "필요 없다"고 했던
  scope를 다시 필요로 함** — HMG 앱 자체 저장(KVS)엔 불필요해도, 개별
  페이지의 커스텀 REST 로직에는 필요할 수 있다는 점을 확인

## 5. postMessage Adapter 패턴 설계 (가정: script 제거가 없다면)

HMG가 7.3항에서 제안한 `iframe → postMessage → 부모 Custom UI →
Resolver → asUser().requestConfluence()` 구조를 실제로 코드화함.

- 8개 apiId 화이트리스트 정의 (임의 URL을 넘기는 범용 Proxy 방식은 배제,
  HMG가 명시적으로 지양하라고 한 방식)
- 사용자(콘텐츠 작성자) 입장에서는 `HmgAdapter.call(apiId, params, body)`
  하나만 알면 되도록 설계 — 실제로 이 전역 객체를 HMG Runtime이 주입해줄지,
  사용자가 직접 postMessage 로직을 짜야 할지는 **HMG에 확인 필요한
  미해결 질문**
- **변환 불가 확인된 항목**: `fetchMemberEmails()` (DC 프로필 페이지
  스크래핑 방식) — Cloud REST에 1:1 대응이 없음. 대안 3가지 제시
  (조직도 페이지에 이메일 필드 직접 관리 / Admin API / 사내 디렉터리 연동)

## 6. 독립 테스트용 Forge 앱 구현 및 빌드 검증 완료

HMG 프로덕션 앱을 건드리지 않고 Adapter 패턴만 검증하는 테스트 앱을
새로 만들고, **`npm install` + `npm run build`까지 실제로 실행해 빌드
성공을 확인**함 (`forge deploy`는 이 환경에서 Forge CLI 로그인이
안 되어 실행 못함 — 로컬/사내 환경에서 진행 필요).

- 매크로에 "HTML 편집" / "미리보기" 탭 제공
- 미리보기는 sandboxed iframe + 주입된 Runtime(`window.HmgAdapter`)으로
  실제 postMessage 왕복 확인 가능
- 로그창으로 apiId별 호출 성공/실패 실시간 확인

---

## 7. 지금까지 만든 파일 목록

| 파일 | 성격 | 위치(다운로드됨) |
|---|---|---|
| `html_macro_변환_postMessage_adapter.html` | 실제 사용 가능한 클라이언트 코드 (원본 PM 페이지를 Adapter 패턴으로 변환, node --check 통과) | outputs |
| `resolver-adapter-example.js` | HMG에 "이렇게 구현해달라"고 보낼 **요청서/참고 예시** (실제 app 구현 아님) | outputs |
| `conversion-notes.md` | 위 변환 내역 요약 + HMG에 물어볼 질문 목록 | outputs |
| `hmg-adapter-test-app.zip` | **실제 빌드 검증까지 마친** 독립 테스트용 Forge 앱 전체 프로젝트 (manifest, resolver, Custom UI 프론트엔드, README) | outputs |
| (본 문서) `project-summary.md` | 전체 정리 문서 | outputs |
| `hmg-questions.md` | 미해결 1~5번 항목을 HMG에 전달할 질문지로 정리한 문서 (2026-08-13) | 프로젝트 루트 |
| `forge-custom-ui-vs-ui-kit.md` | UI Kit vs Custom UI 방식 설명 + 이번 배포에서 만난 manifest 오류 원인 정리 (2026-08-13) | 프로젝트 루트 |

> 참고: `hmg_migrate_page_ver_0019.py`(마이그레이션 스크립트)와
> `html_macro_에서_rest_api_를_사용한_html_원문.html`(원본 REST 사용 예시)은
> 사용자가 업로드하신 원본 파일이며, 이 정리 문서에는 별도 포함하지
> 않았습니다.

## 8. 다음 단계 (2026-08-13 진행 상황 업데이트)

| # | 항목 | 상태 |
|---|---|---|
| 1 | `<script>` 제거로 인한 원본 기능 손실 여부 재확인 | HMG 확인 필요 |
| 2 | postMessage Adapter 실제 구현 여부 | HMG 확인 필요 |
| 3 | Adapter 전역 함수(`HmgAdapter.call` 등) 자동 주입 여부 | HMG 확인 필요 |
| 4 | `read:content:confluence` 등 REST 연동 전용 scope 추가 가능 여부 | HMG 확인 필요 |
| 5 | `/display/~username` 이메일 스크래핑 대체 방안 권장안 | HMG 확인 필요 |
| 6 | `hmg-adapter-test-app` 실사이트 배포 검증 | **완료** |

1~5번은 모두 HMG 담당자 확인이 필요한 항목이라 이번 세션에서는 코드/문서로
해결할 수 없었고, 대신 다섯 가지를 한 번에 전달할 수 있도록 질문지로
정리했습니다 → **`hmg-questions.md`** 참고.

6번은 이번 세션에서 직접 완료했습니다: `hmg-adapter-test-app`을 HMG 프로덕션
앱과 무관하게 사용자 개인 Confluence 사이트(`hakisung.atlassian.net`)에
`forge register` → `forge deploy -e development` → `forge install`까지
실제로 진행해 설치를 확인했습니다. 그 과정에서 manifest.yml의 설정 오류
2건(Custom UI인데 UI Kit 전용 필드 `render: native`가 남아있던 것, resolver
핸들러 경로 불일치)과 백엔드 의존성 미설치 문제를 발견해 수정했습니다.
관련 배경 설명은 **`forge-custom-ui-vs-ui-kit.md`** 참고.

**남은 작업**: Confluence 페이지에 매크로를 실제로 삽입해 postMessage
왕복 및 apiId별 API 호출이 브라우저에서 정상 동작하는지 육안 확인 (자동화된
코드/배포 검증까지만 이번 세션에서 완료됨).

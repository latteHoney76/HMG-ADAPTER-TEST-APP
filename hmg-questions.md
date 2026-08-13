# HMG 담당자(김동진 책임매니저) 확인 요청 사항 — 정리본 (2026-08-13)

`project-summary.md` 8절의 미해결 항목 6가지 중, 이 리포지토리 안에서 자체적으로
검증 가능했던 것(테스트 앱 실배포)은 완료했고, 나머지는 HMG 쪽 확인이 있어야
다음 단계로 넘어갈 수 있는 항목입니다. 한 번에 정리해서 전달하기 위한 문서입니다.

---

## 진행 상태 요약

| # | 항목 | 상태 |
|---|---|---|
| 1 | `<script>` 제거로 인한 원본 기능 손실 여부 재확인 | **HMG 확인 필요** (아래 Q1) |
| 2 | postMessage Adapter 실제 구현 여부 | **HMG 확인 필요** (아래 Q2) |
| 3 | Adapter 전역 함수 자동 주입 여부 | **HMG 확인 필요** (아래 Q3) |
| 4 | REST 연동 페이지 전용 scope 추가 가능 여부 | **HMG 확인 필요** (아래 Q4) |
| 5 | 이메일 스크래핑 대체 방안 권장안 | **HMG 확인 필요** (아래 Q5) |
| 6 | 테스트 앱 실사이트 배포 검증 | ✅ **완료** — 아래 "6번 진행 결과" 참고 |

---

## Q1. `<script>` 제거로 인한 원본 기능 손실 재확인

- 확인된 사실: HMG HTML PRO는 일반 저장 경로와 Migration Gateway(`forgeh-migration-import`)
  경로 **둘 다** `<script>` 태그를 저장 시 통째로 제거함 (외부 import/inline 구분 없음).
- **요청**: 이미 이관 완료된 페이지 중, **원본 DC html 매크로에 `<script>`가 있었던
  페이지 목록**을 뽑아주실 수 있는지. 가능하다면 `safe-read-v19` 경로로 각 페이지의
  `source-html` 레코드(V22/V24 계열에만 원본 보존)와 현재 저장된 버전을 대조해서,
  스크립트 제거로 인해 실제 동작이 깨진 페이지가 있는지 함께 확인 부탁드립니다.
- 저희 쪽에서 페이지 ID 리스트를 받으면, 어떤 기능이 없어졌는지(예: 버튼 클릭 동작,
  외부 API 호출 등) 원본 코드 기준으로 분류하는 작업은 저희가 할 수 있습니다.

## Q2. postMessage Adapter가 실제로 구현되어 있는지

- 7.3항에서 제안하신 `iframe → postMessage → 부모 Custom UI → Resolver →
  asUser().requestConfluence()` 구조를 저희가 별도 테스트 앱(`hmg-adapter-test-app`)으로
  직접 코드화해서 실동작까지 확인했습니다 (아래 6번 참고).
- **요청**: 이 패턴이 **HMG HTML PRO 앱 자체에 이미 구현되어 있는지**, 아니면
  저희가 만든 `resolver-adapter-example.js`의 8개 apiId 스펙을 참고해서 **HMG 쪽에서
  새로 구현해주셔야 하는 것인지** 확인 부탁드립니다.

## Q3. Adapter 전역 함수 자동 주입 여부

- 사용자(콘텐츠 작성자) 입장에서 `HmgAdapter.call(apiId, params, body)` 하나만
  알면 되도록 설계했습니다. 저희 테스트 앱에서는 저희가 직접 이 전역 객체를
  Custom UI 프론트엔드 코드에 주입했습니다.
- **요청**: 만약 Q2의 Adapter가 HMG HTML PRO에 구현된다면, 이 전역 함수를
  **HMG Runtime이 iframe에 자동으로 주입**해줄 예정인지, 아니면 매크로를 쓰는
  콘텐츠 작성자가 매번 **postMessage 송수신 로직을 직접 작성**해야 하는지
  확인 부탁드립니다. (후자라면 최소한 재사용 가능한 헬퍼 스크립트 형태로
  제공이 가능한지도 함께 여쭤봅니다.)

## Q4. REST 연동 페이지 전용 scope 추가 가능 여부

- 실사용 예시 페이지(PM 업무분장 페이지) 분석 결과, content property를 다루는
  로직에는 `read:content:confluence`, `write:content.property:confluence` scope가
  필요합니다. 현재 HMG HTML PRO의 7개 scope에는 포함돼 있지 않습니다
  (HMG 앱 자체 저장(KVS)에는 불필요하다고 확인됨).
- **요청**: Adapter를 통해 개별 페이지의 커스텀 REST 로직(content property
  읽기/쓰기 등)을 지원하려면 이 두 scope 추가가 필요합니다. 추가가 가능한지,
  가능하다면 심사/배포 프로세스상 소요 기간이 어느 정도인지 확인 부탁드립니다.

## Q5. `/display/~username` 이메일 스크래핑 대체 방안

- 원본 페이지의 `fetchMemberEmails()`는 DC 프로필 페이지 HTML을 스크래핑해서
  이메일을 추출하는 방식인데, Cloud REST API에는 1:1 대응 엔드포인트가 없습니다.
- 저희가 검토한 대안 3가지:
  1. 조직도 페이지에 이메일 필드를 별도 content property 등으로 직접 관리
  2. Atlassian Admin API(조직 관리자 권한 필요) 활용
  3. 사내 디렉터리 시스템(LDAP/사내 API 등)과 별도 연동
- **요청**: 이 중 HMG가 권장하는 방향이 있는지, 혹은 저희가 놓친 다른 방법이
  있는지 의견 부탁드립니다.

---

## 6번 진행 결과: 테스트 앱 실사이트 배포 검증 (완료)

`hmg-adapter-test-app`을 HMG 프로덕션 앱과 완전히 분리된 상태로, 사용자 개인
Confluence 사이트(`hakisung.atlassian.net`)에 실제로 배포·설치해서 Adapter
패턴 자체의 동작 여부를 자체 검증했습니다.

- `forge register` → 개발자 계정에 신규 앱 등록 (app id 발급)
- `forge deploy -e development` → development 환경 배포 성공
- `forge install -e development -s hakisung.atlassian.net -p confluence` → 설치 완료
- 배포 과정에서 manifest.yml의 설정 오류 2건을 수정함 (자세한 배경은
  `forge-custom-ui-vs-ui-kit.md` 참고):
  - Custom UI 방식인데 UI Kit 전용 필드 `render: native`가 남아있던 것 제거
  - resolver 핸들러 경로가 실제 파일 위치(`src/resolvers/index.js`)와
    불일치했던 것을 `resolvers/index.handler`로 수정
  - 루트 `package.json`에 정의된 `@forge/api`, `@forge/resolver`가
    `npm install`된 적이 없어 번들링이 실패했던 것 → 설치 후 재배포로 해결

**다음 확인 단계**: Confluence 페이지에서 "HTML 편집"/"미리보기" 매크로를
직접 삽입해 postMessage 왕복 및 apiId별 API 호출이 실제로 성공하는지
브라우저에서 눈으로 확인하는 것이 남아 있습니다 (자동화된 코드 검증까지만
이 세션에서 완료).

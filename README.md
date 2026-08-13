# HMG Adapter Test App

postMessage 기반 REST Adapter 패턴(iframe → 부모 Custom UI → Resolver →
`asUser().requestConfluence()`)이 실제로 동작하는지 **HMG 프로덕션 앱과
무관하게** 독립적으로 검증하기 위한 테스트용 Forge 앱입니다.

이미 이 환경에서 `npm install` + `npm run build`까지 실행해 빌드 성공을
확인했습니다. 실제 Confluence Cloud에 올리려면 아래 단계를 로컬(또는 사내
Forge CLI 사용 가능한 환경)에서 진행하시면 됩니다.

## 뭘 테스트할 수 있나

1. 매크로를 페이지에 삽입하면 "HTML 편집" / "미리보기" 탭이 뜹니다.
2. 편집 탭에 테스트하고 싶은 HTML(REST 호출 포함)을 붙여넣고 저장합니다.
3. 미리보기 탭을 누르면 그 HTML이 **sandboxed iframe**에서 실행되고,
   이 iframe 안에서 `HmgAdapter.call(apiId, params, body)`를 호출하면
   실제로 postMessage → Resolver → `requestConfluence()`까지 왕복해서
   진짜 Confluence Cloud REST 응답을 돌려받습니다.
4. 화면 하단 로그창에 어떤 apiId가 호출됐고 성공/실패했는지 실시간으로 찍힙니다.

기본으로 들어있는 샘플 HTML은 `get-current-user` 호출 버튼입니다 — 이것부터
눌러보시면 가장 빠르게 왕복 확인이 가능합니다.

## 사전 준비

```bash
npm install -g @forge/cli
forge login   # Atlassian 계정으로 로그인 (사내 SSO 정책에 따라 다를 수 있음)
```

## 배포 절차

```bash
cd hmg-adapter-test-app

# 1) 프론트엔드 빌드 (이미 한 번 검증됨 - 코드 수정 시 다시 실행)
npm run build

# 2) Forge 앱 등록 (최초 1회) - manifest.yml의 app.id가 자동으로 채워짐
forge register

# 3) 배포
forge deploy

# 4) 사이트에 설치 (사이트 도메인/스코프 동의 필요)
forge install
```

설치할 때 나오는 scope 동의 화면에서 manifest.yml에 정의된 7개 scope가
보이면 정상입니다. 설치 후 아무 테스트용 Confluence 페이지에서
"HMG Adapter Test" 매크로를 삽입하면 됩니다.

## 코드 수정 후 재배포

```bash
npm run build   # 프론트 변경 시
forge deploy    # 프론트/백엔드 변경 모두 반영
```

`forge tunnel`을 쓰면 로컬에서 resolver 코드를 즉시 반영해가며 테스트할 수도
있습니다 (프론트엔드 static 자산은 tunnel 대상이 아니라 매번 build+deploy 필요).

## 이 프로젝트가 검증해주는 것 / 안 해주는 것

**검증됨:**
- iframe(sandboxed) 안 임의 JS가 `postMessage`로 부모에 요청 → Resolver가
  실제 Confluence Cloud REST를 호출 → 결과가 다시 iframe으로 돌아오는
  전체 배관이 실제로 동작하는지
- `asUser().requestConfluence()`로 특정 scope 하에서 특정 endpoint가
  실제로 허용/거부되는지 (scope 재검증 목적으로도 유용)

**검증 안 됨 (범위 밖):**
- HMG 프로덕션 앱(`forgeh-dj-html`)의 실제 KVS 저장 로직이나 `<script>`
  제거 정책 자체 (이 테스트 앱은 별도 storage를 씁니다)
- 대량 페이지 마이그레이션 시나리오
- 사용자 이메일 스크래핑(`/display/~username`) 같은 DC 전용 기능의 대체 구현

## 폴더 구조

```
hmg-adapter-test-app/
  manifest.yml              # macro/resolver/scope 정의
  package.json
  src/resolvers/index.js    # Adapter 화이트리스트 + Resolver 함수 (실제 구현)
  static/main/
    package.json
    webpack.config.js
    src/index.html           # Custom UI 루트 템플릿
    src/index.js              # 편집/저장/미리보기/postMessage 릴레이 (실제 구현)
    build/                    # npm run build 결과물 (Forge가 실제로 서빙하는 리소스)
```

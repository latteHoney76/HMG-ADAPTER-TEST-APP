# `hmg-adapter-test-app` 동작 방식 — 소스 코드 기준 상세 설명

(2026-08-13, Forge 앱 개발 경험이 없는 개발자를 대상으로 작성)

전체적으로 이 앱은 **4개의 실행 컨텍스트**가 서로 메시지를 주고받는 구조다.
Forge를 처음 접하면 이 "누가 어디서 실행되는가"가 가장 헷갈리는 부분이라,
그것부터 명확히 짚고 코드를 따라간다.

```
┌─────────────────────────────────────────────────────────────┐
│ Confluence 페이지 (브라우저)                                   │
│                                                                 │
│  ┌───────────────────────────────────────────────────┐        │
│  │ Custom UI iframe (Atlassian이 만든 iframe)           │        │
│  │  = static/main/src/index.js 가 실행되는 곳            │        │
│  │  = "편집기 + 미리보기 + 로그창" 이 앱                  │        │
│  │                                                       │        │
│  │   ┌─────────────────────────────────────┐            │        │
│  │   │ 사용자 HTML iframe (한 단계 더 안쪽)   │            │        │
│  │   │  = 콘텐츠 작성자가 입력한 <script>가    │            │        │
│  │   │    실제로 실행되는 곳                  │            │        │
│  │   │  = window.HmgAdapter 가 여기 주입됨    │            │        │
│  │   └─────────────────────────────────────┘            │        │
│  └───────────────────────────────────────────────────┘        │
└─────────────────────────────────────────────────────────────┘
                          ↕ invoke() / postMessage
┌─────────────────────────────────────────────────────────────┐
│ Forge 백엔드 (Atlassian 클라우드, AWS Lambda 위)                │
│  = src/resolvers/index.js 가 실행되는 곳                        │
│  = 여기서만 실제 Confluence REST API 호출이 나감                │
└─────────────────────────────────────────────────────────────┘
```

핵심은: **iframe 안의 JS는 Confluence API를 직접 못 부른다.** 그래서
"사용자 iframe → 부모 iframe → 백엔드 resolver → 진짜 API 호출 → 역순으로
응답 전달"이라는 릴레이 구조가 필요하다. 이게 이 프로젝트 전체의 존재 이유다.

---

## 1. `manifest.yml` — 이 4개 컨텍스트를 연결하는 설정 파일

```yaml
modules:
  macro:
    - key: hmg-adapter-test
      resource: main              # ← static/main/build 를 iframe에 로드
      resolver:
        function: resolver        # ← invoke()가 호출할 백엔드 함수 이름표

  function:
    - key: resolver
      handler: resolvers/index.handler   # ← src/resolvers/index.js의 export handler

resources:
  - key: main
    path: static/main/build       # ← webpack 빌드 결과물 위치
```

- `macro`는 Confluence 페이지에 "매크로 삽입" 메뉴에서 보이는 이 앱의 단위다.
- `resource: main`이 `static/main/build`(즉 `index.html` + `bundle.js`)를 iframe에
  로드하라는 지시다.
- `resolver.function: resolver`는 프론트엔드가 `invoke('함수이름', ...)`을
  호출했을 때 **어느 백엔드 함수 묶음으로 갈지** 정하는 연결고리다.
  `function.handler`는 그 실체가 `src/resolvers/index.js`의
  `export const handler`라는 뜻이다.
- `permissions.scopes`는 백엔드가 `asUser().requestConfluence()`로 부를 수
  있는 API 범위다. 이건 iframe이 아니라 **백엔드 함수의 권한**이다.

## 2. 백엔드: `src/resolvers/index.js` — 실제 API 호출이 나가는 유일한 곳

```js
import Resolver from '@forge/resolver';
const resolver = new Resolver();
```

`@forge/resolver`는 "프론트엔드에서 이름으로 부를 수 있는 함수들"을 등록하는
헬퍼다. 이 파일에는 3개의 함수가 등록돼 있다.

**(1) `getStoredHtml` / `saveHtml`** — 매크로 인스턴스별 HTML 원문 저장·조회

```js
resolver.define('saveHtml', async (req) => {
  const { localId, html } = req.payload;
  await storage.set(`test-html:${localId}`, html);
  return { ok: true };
});
```

`localId`는 같은 페이지에 매크로를 여러 개 넣어도 서로 안 섞이게 하는
키다. `@forge/api`의 `storage`(Forge 앱 전용 key-value 저장소)에 저장한다.

**(2) `callConfluenceApi`** — 이 앱의 핵심, "화이트리스트 기반 REST Adapter"

```js
const API_ALLOWLIST = {
  'get-current-user': {
    method: 'GET',
    build: () => route`/wiki/rest/api/user/current`,
    executionMode: 'asUser',
  },
  // ... list-child-pages, get-page, update-page-body,
  //     get-content-property, create/update-content-property,
  //     search-user-by-name  (총 8개)
};

resolver.define('callConfluenceApi', async (req) => {
  const { apiId, params = {}, body } = req.payload;
  const spec = API_ALLOWLIST[apiId];
  if (!spec) return { ok: false, status: 400, body: { error: `허용되지 않은 apiId: ${apiId}` } };

  const client = spec.executionMode === 'asApp' ? api.asApp() : api.asUser();
  const response = await client.requestConfluence(spec.build(params), { method: spec.method, ... });
  ...
  return { ok, status, body: responseBody };
});
```

핵심 설계 의도는 **"임의의 URL을 그대로 넘겨서 아무 API나 부르게 하지
않는다"**는 것이다. 프론트엔드가 넘길 수 있는 건 `apiId`(예:
`'get-current-user'`)라는 이름표뿐이고, 실제 어떤 엔드포인트를 어떤 HTTP
메서드로 부를지는 이 화이트리스트가 서버 쪽에서 결정한다. 이게
`project-summary.md` 5절에서 언급한 "범용 Proxy 방식은 배제"의 실제 구현이다.

`api.asUser()`는 **매크로를 보고 있는 그 사용자의 권한**으로 API를 호출한다는
뜻이다 (그 사용자가 볼 수 없는 페이지는 이 Adapter로도 못 봄 — 권한 우회가
없다는 게 중요한 안전장치).

## 3. 프론트엔드(Custom UI 부모): `static/main/src/index.js`

이 파일이 실제로 iframe에 로드되는 "편집기 + 미리보기 + 로그" 화면의
로직이다. 크게 3부분이다.

**(a) `RUNTIME_SCRIPT` — 사용자 HTML 앞에 주입되는 어댑터 런타임**

```js
window.HmgAdapter = {
  call: function (apiId, params, body) {
    return new Promise(function (resolve, reject) {
      var requestId = 'req_' + Date.now() + ...;
      window.HmgAdapter._pending[requestId] = { resolve: ... };
      window.parent.postMessage({ type: 'hmg-adapter-request', requestId, apiId, params, body }, '*');
    });
  },
};
window.addEventListener('message', function (e) {
  // 'hmg-adapter-response' 타입 메시지가 오면 그 requestId의 Promise를 resolve
});
```

이건 **문자열 템플릿**이다 — 실제 실행 환경이 아니라 `renderPreview()`에서
사용자가 쓴 HTML **앞에 텍스트로 이어붙여서** iframe에 통째로 넣는다:

```js
function renderPreview() {
  const userHtml = editor.value;
  frame.srcdoc = RUNTIME_SCRIPT + userHtml;   // ← 여기서 이어붙임
}
```

그래서 사용자가 편집기에 넣은 `<script>testCall()...</script>` 안에서
`HmgAdapter.call(...)`을 부르면, 그건 **한 단계 더 안쪽의 별도 iframe**
(`preview-frame`, `sandbox="allow-scripts ..."`)에서 실행되고, 거기서
`window.parent`(=이 index.js가 실행 중인 iframe)로 `postMessage`를 쏘는
것이다. `requestId`로 요청/응답 쌍을 맞추고, 15초 타임아웃도 걸려 있다.

**(b) 부모 iframe이 그 요청을 받아 백엔드로 중계**

```js
window.addEventListener('message', async (event) => {
  if (event.source !== frame.contentWindow) return;  // 우리가 만든 그 안쪽 iframe이 보낸 게 맞는지 검증
  const msg = event.data;
  if (msg.type !== 'hmg-adapter-request') return;

  const result = await invoke('callConfluenceApi', { apiId: msg.apiId, params: msg.params, body: msg.body });

  frame.contentWindow.postMessage(
    { type: 'hmg-adapter-response', requestId: msg.requestId, ok: result.ok, status: result.status, body: result.body },
    '*'
  );
});
```

`invoke('callConfluenceApi', ...)`가 바로 앞서 본 백엔드 resolver를 호출하는
부분이다. `@forge/bridge`가 제공하는 함수로, "이 Custom UI iframe에서
백엔드 함수를 부르는" 유일한 공식 통로다. 응답이 오면 그대로 안쪽 iframe에
다시 `postMessage`로 돌려준다.

여기서 `event.source !== frame.contentWindow` 체크가 보안상 중요하다 —
페이지 안에 다른 iframe이나 스크립트가 있어도 **우리가 만든 그 안쪽
iframe에서 온 메시지만** 처리한다는 검증이다.

**(c) 편집기/저장/초기화**

```js
(async function init() {
  const context = await view.getContext();
  localId = context.extension?.macro?.localId || 'default';
  const { html } = await invoke('getStoredHtml', { localId });
  editor.value = html || defaultSample();
})();
```

`view.getContext()`도 `@forge/bridge`가 주는 함수로, "지금 이 매크로
인스턴스가 어떤 페이지의 몇 번째 매크로인지" 등의 컨텍스트를 준다. 여기서
얻은 `localId`로 저장/조회 시 매크로 인스턴스를 구분한다.

## 4. 빌드: `static/main/webpack.config.js`

```js
entry: 'src/index.js',
output: { path: 'build', filename: 'bundle.js' },
plugins: [new HtmlWebpackPlugin({ template: 'src/index.html' })],
```

`src/index.js` + `src/index.html`을 `build/bundle.js` + `build/index.html`로
묶는다. `manifest.yml`의 `resources.main.path: static/main/build`가 가리키는
게 바로 이 결과물이고, `forge deploy`는 이 `build/` 폴더 내용을 Forge
클라우드에 업로드한다. (그래서 배포 전에 반드시 `npm run build`가 먼저
필요했던 것이고, 소스만 고치고 build를 다시 안 하면 배포에 옛날 코드가
나간다.)

## 5. 실제 요청 1건의 전체 흐름 (예: "현재 사용자 조회" 버튼 클릭)

1. 사용자가 편집기에 `defaultSample()` 같은 HTML을 넣고 "미리보기" 클릭 →
   `RUNTIME_SCRIPT + userHtml`이 안쪽 `preview-frame`의 `srcdoc`으로 들어감
2. 사용자가 "현재 사용자 조회 테스트" 버튼 클릭 → 안쪽 iframe의 `testCall()`
   → `HmgAdapter.call('get-current-user', {})`
3. 안쪽 iframe → `window.parent.postMessage({type:'hmg-adapter-request', apiId:'get-current-user', ...})`
4. 부모(index.js)의 `message` 리스너가 받아서 →
   `invoke('callConfluenceApi', {apiId:'get-current-user', ...})`
5. Forge가 이걸 백엔드로 전달 → `resolvers/index.js`의 `callConfluenceApi`가
   `API_ALLOWLIST['get-current-user']`를 찾아
   `api.asUser().requestConfluence('/wiki/rest/api/user/current')` 실제 호출
6. 응답이 백엔드 → `invoke()` 리턴값으로 부모(index.js)에 돌아옴
7. 부모가 `frame.contentWindow.postMessage({type:'hmg-adapter-response', requestId, ...})`로
   안쪽 iframe에 응답 전달
8. 안쪽 iframe의 `HmgAdapter._pending[requestId].resolve(msg)`가 Promise를
   resolve → `testCall()`의 `await HmgAdapter.call(...)`가 끝나고 결과가
   화면에 출력

이 8단계가 `project-summary.md`의 "postMessage Adapter 패턴"이 실제 코드로
어떻게 구현됐는지의 전부다.

## 참고: 관련 문서

- [forge-custom-ui-vs-ui-kit.md](forge-custom-ui-vs-ui-kit.md) — Custom UI와
  UI Kit 방식의 차이, 이 프로젝트가 배포 중 겪은 manifest 오류의 원인
- [hmg-questions.md](hmg-questions.md) — 이 Adapter 패턴을 HMG 프로덕션
  앱에 실제로 반영하기 위해 HMG 담당자에게 확인이 필요한 질문 목록
- [project-summary.md](project-summary.md) — 프로젝트 전체 진행 정리

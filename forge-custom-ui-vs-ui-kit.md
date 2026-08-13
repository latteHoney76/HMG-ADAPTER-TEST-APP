# Forge 프론트엔드 개발 방식: UI Kit vs Custom UI

Atlassian Forge에서 앱의 화면(UI)을 만드는 방법은 크게 두 가지다.

## UI Kit 방식

**한 줄 요약**: Atlassian이 제공하는 React 유사 컴포넌트를 코드로 작성하면, Forge가 그걸 Atlassian 호스팅 환경에서 직접 렌더링해주는 방식.

```jsx
// src/frontend/index.jsx
import ForgeReconciler, { Text, Button } from '@forge/react';

const App = () => {
  return <Text>안녕하세요</Text>;
};

ForgeReconciler.render(<App />);
```

- 직접 만드는 HTML/CSS/JS가 없음 — `@forge/react`가 제공하는 컴포넌트(`Text`, `Button`, `Table` 등)만 조합
- Atlassian 디자인 시스템(Atlassian Design System)과 자동으로 통일된 룩앤필
- 실행은 Atlassian의 iframe 안, **Atlassian이 관리하는 런타임**에서 됨 — 임의의 JS를 자유롭게 못 씀 (외부 라이브러리 로딩, 직접 DOM 조작 등 제약 큼)
- manifest에서 `resource`가 이 UI 정의 파일 하나를 가리킴, 그리고 `render: native`를 명시

## Custom UI 방식

**한 줄 요약**: 개발자가 직접 HTML/CSS/JS(또는 React를 webpack 등으로 빌드한 정적 번들)를 만들고, Forge는 그걸 **sandboxed iframe**에 그대로 로드해주는 방식.

```
static/main/
  src/index.js       ← 직접 짠 프론트엔드 코드
  webpack.config.js
  build/
    index.html        ← 빌드 결과물 (이게 실제로 iframe에 로드됨)
    bundle.js
```

- 완전한 자유도 — 원하는 프레임워크(React/Vue/vanilla), 원하는 스타일링, 원하는 JS 로직 다 가능
- 대신 iframe 안이라 Confluence/Jira 쪽 데이터에 직접 접근 불가 → `@forge/bridge`의 `invoke()`로 **백엔드 resolver를 호출**해서 데이터를 주고받아야 함
- manifest의 `resource`는 빌드된 정적 파일들이 있는 디렉터리를 가리킴 (`static/main/build`), `render: native`는 쓰지 않음

## 비교표

| 필드 | UI Kit일 때 | Custom UI일 때 |
|---|---|---|
| `render` | `native` 명시 | 필드 자체를 생략 |
| `resource`가 가리키는 것 | UI 정의 소스 파일 | 빌드된 정적 파일 디렉터리 |
| 프론트엔드 자유도 | 낮음 (Atlassian 컴포넌트만) | 높음 (임의 HTML/JS/프레임워크) |
| 백엔드 통신 | `@forge/react` 훅 등 | `@forge/bridge`의 `invoke()` |

## 이 프로젝트(hmg-adapter-test-app)에 적용된 결론

이 앱은 Custom UI 방식이다 (`static/main/`에 webpack 빌드 결과물이 있고, 프론트엔드가 `@forge/bridge`로 resolver를 호출하는 구조). 그런데 manifest.yml에 UI Kit 전용 필드인 `render: native`가 남아있어 `forge deploy` 시 lint 에러(`Client Side UI Kit resource ... cannot be a directory`)가 발생했다. 원인은 이전 작업 세션에서 두 방식 중 하나로 시작했다가 구조를 바꾸며 이 한 줄이 정리되지 않은 것으로 추정된다.

수정: `render: native` 삭제, `function.handler`를 실제 파일 위치(`src/resolvers/index.js`)에 맞게 `resolvers/index.handler`로 수정.

# 다른 컴퓨터(홈 Mac)에서 이어서 작업하기

이 프로젝트는 2026-08-13에 GitHub 저장소
(`https://github.com/latteHoney76/HMG-ADAPTER-TEST-APP`)로 git 관리를
시작했습니다. 아래 순서대로 하면 홈 Mac에서 동일한 상태로 이어서 작업할
수 있습니다.

## 1. 이 저장소를 홈 Mac으로 가져오기

git이 처음이시라면 **[GIT-GUIDE.md](GIT-GUIDE.md)**를 먼저 보세요 —
SSH 키 생성부터 clone까지 화면에 뭐가 뜨는지 포함해서 자세히 정리했습니다.
아래는 요약입니다.

```bash
# (집 Mac에서, SSH 키를 만들어 GitHub에 등록한 뒤 — 자세한 건 GIT-GUIDE.md)
git clone git@github.com:latteHoney76/HMG-ADAPTER-TEST-APP.git
cd HMG-ADAPTER-TEST-APP
```

원격 저장소를 아직 안 만드셨다면, GitHub 등에서 새 **private** 저장소를 만든
뒤 위 `git remote add` 명령의 `<your-repo-url>` 자리에 그 주소를 넣으면 됩니다.
(코드 안에 비밀키는 없지만, 사내 프로젝트 관련 내용이라 private 권장.)

## 2. 홈 Mac에 필요한 것 설치

| 항목 | 이 컴퓨터에서 쓴 버전 | 확인 명령 |
|---|---|---|
| Node.js | v24.18.0 | `node --version` |
| npm | 11.16.0 | `npm --version` |
| Forge CLI | 13.2.0 (npx로 실행, 전역 설치 아님) | `npx forge --version` |

Node.js가 없다면 [nodejs.org](https://nodejs.org)에서 설치하거나 nvm 사용.
Forge CLI는 별도 전역 설치 없이 프로젝트 안에서 `npx forge <command>`로
바로 실행하면 됩니다 (이 컴퓨터에서도 그렇게 씀).

## 3. Forge 로그인 (필수, 계정당 1회)

```bash
npx forge login
```

- 로그인 계정: **kisungha@osci.kr** (Account ID: `712020:d108e7fa-22c8-464d-97e8-18a8e2fee2f8`)
- 이 계정으로 로그인해야 아래 앱/사이트에 대한 배포·설치 권한이 있습니다.
- `forge login`은 브라우저 인증이 필요해서 **비대화형(non-TTY) 환경에서는
  실행 안 됩니다** — 터미널을 직접 열어서 실행해야 합니다.

## 4. 의존성 설치 + 빌드

```bash
npm install                    # 루트: @forge/api, @forge/resolver
cd static/main && npm install  # 프론트엔드 의존성
npm run build                  # webpack 빌드 → static/main/build 생성
cd ../..
```

## 5. 이미 등록/배포/설치된 상태 (그대로 유지됨, 재실행 불필요)

이 정보는 로컬 파일이 아니라 **Atlassian 클라우드 쪽 상태**라서, 홈 Mac에서도
`forge login`만 하면 그대로 이어서 다룰 수 있습니다. 새로 `forge register`
할 필요 없습니다 — manifest.yml에 이미 app id가 박혀 있습니다.

| 항목 | 값 |
|---|---|
| App 이름 | `hmg-adapter-test-app` |
| App ID | `ari:cloud:ecosystem::app/5c67e7d8-10a6-4ffe-9ccf-3c1717073da1` (manifest.yml에 기록됨) |
| Developer Space | `test-storage-webtrigger-macro-space` (`c4ef2e90-4c62-49d0-87f4-195b8c7798a1`) |
| 배포된 환경 | `development` |
| 설치된 사이트 | `hakisung.atlassian.net` (Confluence) |

코드를 수정한 뒤 다시 반영하려면:

```bash
cd static/main && npm run build && cd ../..
npx forge deploy -e development
# 설치 자체는 이미 돼 있으므로 재설치 불필요.
# 새 scope를 추가했을 때만:
npx forge install --upgrade -e development -s hakisung.atlassian.net -p confluence
```

## 6. 지금까지의 작업 맥락을 알고 싶다면

읽는 순서 추천:

1. [project-summary.md](project-summary.md) — 프로젝트 전체 배경과 현재 진행 상태 (미해결 6개 항목 포함)
2. [hmg-adapter-app-architecture.md](hmg-adapter-app-architecture.md) — 이 테스트 앱이 소스 코드 레벨에서 어떻게 동작하는지
3. [forge-custom-ui-vs-ui-kit.md](forge-custom-ui-vs-ui-kit.md) — Forge의 두 UI 개발 방식 차이, manifest 오류를 고친 이유
4. [hmg-questions.md](hmg-questions.md) — HMG 담당자(김동진 책임매니저)에게 확인해야 할 질문지 (아직 전달 전)

## 7. 아직 안 끝난 일

- Confluence 페이지에 "HMG Adapter Test" 매크로를 직접 삽입해 브라우저에서
  postMessage/API 호출이 실제로 성공하는지 육안 확인 (코드/배포 검증까지만
  완료된 상태)
- `hmg-questions.md`를 HMG 담당자에게 전달

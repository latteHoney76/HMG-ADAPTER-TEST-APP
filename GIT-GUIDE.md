# Git / GitHub 설정 가이드 (초보자용)

git을 잘 모르는 상태에서 시작하시는 걸 감안해서, 우리가 이번에 무엇을 왜
했는지부터 집 Mac에서 시작하는 법까지 순서대로 정리했습니다.

---

## 1. 기본 개념 3가지만 먼저

- **로컬 저장소(local repository)**: 지금 이 컴퓨터의 `hmg-adapter-test-app`
  폴더 안에 있는 `.git` 폴더 — 이 폴더의 모든 변경 이력이 여기 저장됩니다.
- **원격 저장소(remote repository)**: GitHub 서버에 있는 사본
  (`https://github.com/latteHoney76/HMG-ADAPTER-TEST-APP`). 여러 컴퓨터가
  이 원격 저장소를 통해 같은 코드를 주고받습니다.
- **push / pull**:
  - `git push` = 지금 컴퓨터의 변경사항을 GitHub로 **올리기**
  - `git pull` = GitHub에 있는 최신 변경사항을 지금 컴퓨터로 **받아오기**

두 대의 Mac을 오가며 작업할 때는, **작업 시작 전에는 `git pull`, 작업 끝나면
`git push`** 이 두 가지만 습관화하면 충돌 없이 이어서 작업할 수 있습니다.

## 2. 이번에 사무실 Mac에서 한 작업 (왜 했는지)

| 단계 | 명령 | 왜 했는지 |
|---|---|---|
| 1 | `git config --global user.name/email` | 커밋에 "누가 변경했는지" 기록하려면 필요 (아무 값도 없어서 새로 설정함) |
| 2 | `.gitignore` 작성 | `node_modules/`(용량 크고 `npm install`로 재생성 가능), `build/`(빌드 결과물, 소스에서 재생성 가능), `.claude/`(로컬 전용 설정) 는 저장소에 넣지 않도록 제외 |
| 3 | `git init` | 이 폴더를 git 저장소로 초기화 |
| 4 | `git add -A` + `git commit` | 현재 파일 상태를 하나의 "스냅샷(커밋)"으로 저장 |
| 5 | `ssh-keygen -t ed25519` | GitHub에 push하려면 인증이 필요한데, 비밀번호 대신 **SSH 키**(공개키/비밀키 쌍)로 인증하는 방식을 씀. 비밀키는 이 컴퓨터에만 남고, 공개키만 GitHub에 등록 |
| 6 | GitHub 웹사이트에서 공개키 등록 | GitHub이 "이 컴퓨터가 latteHoney76 계정 소유자가 맞다"고 인식하게 함 |
| 7 | `git remote add origin git@github.com:...` | 로컬 저장소에 "원격 저장소가 여기 있다"고 주소를 알려줌 |
| 8 | `git push -u origin main` | 실제로 GitHub에 업로드. `-u`는 이후부터 그냥 `git push`만 쳐도 어디로 보낼지 기억하게 하는 옵션 |

**중요**: 5~6번(SSH 키)은 **컴퓨터마다 따로** 해야 합니다. 이 사무실 Mac의
키는 이 컴퓨터 전용이고, 집 Mac은 집 Mac대로 새 키를 만들어서 등록해야
합니다 (한 GitHub 계정에 여러 컴퓨터의 키를 등록해두는 게 정상입니다 —
Settings → SSH keys에 여러 개 나열됩니다).

## 3. 집 Mac에서 처음 시작하는 법 (터미널에서 순서대로)

### 3-1. git이 설치돼 있는지 확인

```bash
git --version
```

macOS는 보통 기본 내장돼 있거나, 처음 실행 시 Xcode Command Line Tools
설치를 자동으로 물어봅니다. 물어보면 설치 진행하시면 됩니다.

### 3-2. 이 컴퓨터 전용 SSH 키 생성

```bash
ssh-keygen -t ed25519 -C "hastareye@gmail.com"
```

- 저장 위치를 물어보면 그냥 Enter (기본값 `~/.ssh/id_ed25519` 사용)
- 암호(passphrase)를 물어보면 원하시면 설정, 귀찮으면 그냥 Enter(암호 없음)로도 가능

### 3-3. 공개키를 화면에 출력해서 복사

```bash
cat ~/.ssh/id_ed25519.pub
```

출력된 내용 전체(`ssh-ed25519`로 시작하는 한 줄)를 복사.

### 3-4. GitHub에 이 공개키 등록

1. 브라우저에서 https://github.com/settings/ssh/new
2. Title: 예) `home-mac` (사무실 Mac과 구분되는 이름)
3. Key 칸에 복사한 공개키 붙여넣기 → **Add SSH key**

### 3-5. 저장소 복제(clone)

```bash
cd ~/원하는_작업_폴더
git clone git@github.com:latteHoney76/HMG-ADAPTER-TEST-APP.git
cd HMG-ADAPTER-TEST-APP
```

처음 연결 시 `Are you sure you want to continue connecting?` 같은 질문이
나오면 `yes` 입력.

### 3-6. 이후 이어서 개발하기 위한 준비

이 저장소에는 `node_modules/`와 `build/`가 빠져 있으므로(용량 문제로
git에 안 올림), 클론 직후 반드시 다시 설치/빌드해야 합니다:

```bash
npm install                    # 루트 의존성
cd static/main && npm install  # 프론트엔드 의존성
npm run build                  # 빌드 결과물 생성
cd ../..
```

그리고 Forge CLI 로그인 (배포/설치 관련 작업을 하려면 필요, 코드만 보고
편집만 할 거면 생략 가능):

```bash
npx forge login
```

나머지 세부 절차(Forge App ID, 배포된 사이트 정보 등)는
[HANDOFF.md](HANDOFF.md)에 정리돼 있습니다.

## 4. 앞으로 두 Mac을 오가며 작업하는 기본 흐름

```bash
# 작업 시작 전 (항상 먼저)
git pull

# ... 코드 수정 ...

# 작업 끝나고
git add -A
git commit -m "무엇을 왜 바꿨는지 한 줄 설명"
git push
```

한쪽 Mac에서 push 안 하고 다른 쪽에서 pull하면 예전 상태만 받아오니, **한
컴퓨터에서 작업을 마쳤으면 꼭 push까지 하고 자리를 떠나는 것**이 두 컴퓨터
간 동기화의 핵심입니다.

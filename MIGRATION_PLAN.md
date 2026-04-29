# pumlex 모노레포 마이그레이션 계획

**상태**: 결정됨, 실행 대기. 컴팩트 후 이 파일을 읽고 바로 진행.

## 결정 사항

- **모노레포 이름**: `pumlex` (현재 archi-duke/pumlex 레포를 모노레포로 전환)
- **합칠 레포**:
  - `archi-duke/plantumlEx` (origin: ~/Works/plantumlEx) — Express 서버 + pex-* 코어
  - `archi-duke/pumlex` (origin: ~/Works/pumlex) — VS Code extension
- **워크스페이스 도구**: npm workspaces (Lerna/Nx 불필요)
- **히스토리**: **보존** (`git subtree` 또는 `git filter-repo`로 두 레포 히스토리 합침)

## 목표 구조

```
pumlex/                              ← 기존 archi-duke/pumlex 레포 그대로 사용
├── package.json                     ← workspaces: ["packages/*"]
├── packages/
│   ├── pex-core/                   ← geom + meta + inline (현 plantumlEx/public/pex-*.js)
│   │   ├── package.json            (name: "@archi-duke/pex-core")
│   │   ├── geom.js, meta.js, inline.js
│   │   └── README.md
│   ├── pex-server/                 ← 현 archi-duke/plantumlEx 내용
│   │   ├── package.json            (depends: "@archi-duke/pex-core": "*")
│   │   ├── server.js
│   │   ├── public/
│   │   │   ├── edit.html
│   │   │   └── demo-host.html
│   │   └── docs/
│   └── pex-vscode/                 ← 현 archi-duke/pumlex의 src/, media/, lib/ 등
│       ├── package.json            (depends: "@archi-duke/pex-core": "*")
│       ├── src/, media/, .vscode/, .vscodeignore, etc.
│       └── README.md
├── ROADMAP.md                      ← 현 pumlex/ROADMAP.md 보존, 패키지별 섹션 분리
├── LICENSE                         ← MIT 그대로
└── README.md                       ← 모노레포 개요 + 각 패키지 빠른 링크
```

## 마이그레이션 단계

### 1. 백업 + 사전 준비
- 두 로컬 작업 트리 클린 상태 확인 (✓ 완료, 2026-04-29)
- 모노레포 디렉토리 새로 만들 거 vs 기존 pumlex 그대로 변형할 거 결정
  - **선택**: 기존 pumlex 디렉토리 자리에서 변형 (history 보존 + 원격 그대로 유지)

### 2. plantumlEx 히스토리를 pumlex 안의 packages/pex-server/로 끌어오기

```bash
cd /Users/dukekimm/Works/pumlex
git remote add upstream-server ../plantumlEx
git fetch upstream-server
git merge --allow-unrelated-histories upstream-server/main -X theirs --no-commit
# ↑ 충돌 발생 시 우리(pumlex) 쪽 우선
# 또는 더 깔끔하게:
git subtree add --prefix=packages/pex-server upstream-server/main --squash=false
```

### 3. 디렉토리 재배치
```bash
# 현 pumlex의 root-level 파일/디렉토리를 packages/pex-vscode/로 이동
mkdir -p packages/pex-vscode
git mv src lib media .vscode .vscodeignore sample.md packages/pex-vscode/
git mv tsconfig.json packages/pex-vscode/
# package.json은 root용 새로 만들고, 기존은 packages/pex-vscode/로 이동
```

### 4. pex-core 추출
```bash
mkdir -p packages/pex-core
git mv packages/pex-server/public/pex-geom.js packages/pex-core/geom.js
git mv packages/pex-server/public/pex-meta.js packages/pex-core/meta.js
git mv packages/pex-server/public/pex-inline.js packages/pex-core/inline.js
# pex-server의 server.js와 pex-vscode/src/* 임포트 경로 수정
# pex-vscode/lib/ 삭제 (대신 @archi-duke/pex-core 의존)
rm -rf packages/pex-vscode/lib
```

### 5. workspaces 설정
**Root `package.json`** (새로 작성):
```json
{
  "name": "pumlex",
  "private": true,
  "workspaces": ["packages/*"],
  "scripts": {
    "build": "npm run build --workspaces --if-present",
    "package:vscode": "npm run package --workspace=@archi-duke/pex-vscode",
    "start:server": "npm start --workspace=@archi-duke/pex-server"
  }
}
```

**`packages/pex-core/package.json`**:
```json
{ "name": "@archi-duke/pex-core", "version": "0.0.1", "main": "inline.js", "files": ["*.js"] }
```

**`packages/pex-server/package.json`** (기존 plantumlEx의 package.json):
```json
{ ..., "dependencies": { "@archi-duke/pex-core": "*", ... }, ... }
```

**`packages/pex-vscode/package.json`** (기존 pumlex의 package.json):
```json
{ ..., "dependencies": { "@archi-duke/pex-core": "*" }, ... }
```

### 6. 임포트 경로 수정

**pex-server/server.js**:
```js
// before: const PexGeom = require('./public/pex-geom');
const PexGeom = require('@archi-duke/pex-core/geom');
const PexMeta = require('@archi-duke/pex-core/meta');
```

**pex-server/public/edit.html, demo-host.html**:
```html
<!-- before: <script src="/pex-geom.js"></script> -->
<script src="/lib/pex-core/geom.js"></script>  <!-- 또는 server.js에서 별도 라우트 -->
```
→ 또는 server.js가 `app.use('/lib/pex-core', express.static(path.join(__dirname, '../../node_modules/@archi-duke/pex-core')))` 추가

**pex-vscode**:
- `markdown.previewScripts`를 `node_modules/@archi-duke/pex-core/*.js`로 가리킴 (npm workspace symlink)
- vsce 패키징 시 symlink 처리: `--include-symlinks` 또는 빌드 시 복사

### 7. 빌드/테스트
- `npm install` (root) → workspaces symlink 생성
- `npm run build` → 모든 패키지 빌드
- pex-server: `cd packages/pex-server && npm start` → 8080/3030 정상 동작?
- pex-vscode: `cd packages/pex-vscode && code .` → F5 dev host에서 동작?
- pex-vscode: `npm run package` → .vsix 정상 빌드?

### 8. 정리
- ROADMAP.md를 root로 이동, 패키지별 섹션 추가
- README.md (root) 작성: 모노레포 개요 + 각 패키지 link
- 기존 archi-duke/plantumlEx 레포는 README에 "이 레포는 archi-duke/pumlex 모노레포로 이전됨" 안내 추가 후 archive

## 위험 요소

- **vsce 패키징과 npm workspace symlink**: `@archi-duke/pex-core`가 symlink로 연결돼있으면 `vsce package`가 그대로 따라가지 않을 수 있음. 해결책:
  - 빌드 시 lib/ 안으로 복사하는 prepublish 스크립트
  - 또는 vsce의 `--include-symlinks` 옵션 활용
- **PlantUML 서버 정적 자원 경로**: edit.html / demo-host.html이 `/pex-geom.js`로 요청하는 경로 변경 필요
- **history 보존 시 충돌**: `git merge --allow-unrelated-histories`로 ROADMAP.md 등이 양쪽에 있으면 충돌 가능 → 수동 해결

## 검증 체크리스트

- [ ] root에서 `npm install` 성공, workspace symlink 생성 확인
- [ ] `npm start --workspace=@archi-duke/pex-server` → 3030 응답
- [ ] http://localhost:3030/demo-host.html 정상 동작 (drag/edit/save round-trip)
- [ ] `cd packages/pex-vscode && code .` → F5 dev host → sample.md 미리보기 정상 (모든 A-* 동작 그대로)
- [ ] `npm run package:vscode` → .vsix 빌드 성공
- [ ] ROADMAP.md 업데이트
- [ ] git push (단일 origin: archi-duke/pumlex.git)

## 완료 후 작업

1. archi-duke/plantumlEx 레포를 archive 처리하고 README에 "이전됨" 공지
2. 사내 사용자에게 이전 안내
3. 다음 ROADMAP 작업 (D-2 → D-1 → E-2 → E-1) 재개

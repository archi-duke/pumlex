# pumlex monorepo

PlantUML 다이어그램의 레이아웃을 인라인 편집할 수 있는 도구 모음. 메타데이터를 PlantUML 소스 안 (`' @startmeta ... ' @endmeta`)에 임베드해 한 파일에 자체 포함되도록 한다.

## Packages

| 패키지 | 역할 |
|---|---|
| [`packages/pex-core`](./packages/pex-core) | `geom` / `meta` / `inline` 공용 모듈. 브라우저·Node 양쪽에서 사용. |
| [`packages/pex-server`](./packages/pex-server) | Express 기반 PlantUML 렌더러. cheerio + plantuml-encoder. `/render-with-layout`, `/diagrams` 등 제공. |
| [`packages/pex-vscode`](./packages/pex-vscode) | VS Code Markdown 미리보기 안에서 인라인 편집을 제공하는 확장 (`pumlex`). |

## 빠른 시작

```bash
# (1) 의존성 설치 — 전 워크스페이스 한번에
npm install

# (2) PlantUML 서버 실행 (별도 터미널)
npm run start:server   # 기본 :3030, PORT=xxxx 로 변경 가능

# (3-a) 웹 데모 — http://localhost:3030/demo-host.html

# (3-b) VS Code 확장 빌드 + .vsix
npm run build:vscode      # tsc + pex-core 복사
npm run package:vscode    # .vsix 생성
code --install-extension packages/pex-vscode/pumlex-*.vsix
```

확장 개발 시: `code packages/pex-vscode` → F5.

## 구조 메모

- `pex-core` 의 `geom.js` / `meta.js` / `inline.js` 는 양쪽 진영에서 공유한다.
  - `pex-server` 는 `require('@archi-duke/pex-core/geom')` 으로 require.
  - `pex-server` 는 `/pex-core/*.js` 정적 라우트로 브라우저(edit.html, demo-host.html)에 서빙.
  - `pex-vscode` 는 빌드 시 `scripts/copy-core.js` 가 `lib/pex-*.js` 로 복사 (`vsce package --no-dependencies` 가 `node_modules` 를 제외하기 때문).
- 워크스페이스 심볼릭 링크는 `node_modules/@archi-duke/pex-{core,server,vscode}` 에 생성된다.

## 라이선스

MIT — [LICENSE](./LICENSE).

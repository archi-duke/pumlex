# pumlex roadmap

기능 + 안정성 작업 목록. 항목이 끝날 때마다 체크박스 갱신.

> 이 레포는 **모노레포**다. `packages/pex-core` (공용), `packages/pex-server` (Express 서버), `packages/pex-vscode` (확장).
> 과거의 `archi-duke/plantumlEx` 레포는 `packages/pex-server` 로 흡수되었다 (히스토리 보존 — `git subtree`).

---

## A. 안정성 / 견고성  ★★★

- [x] **A-1** 첫 fetch 후 placeholder → SVG 자동 전환 — `markdown.preview.refresh` 우선, 실패 시 `markdown.api.reloadPlugins` fallback. 다중 호출 120ms debounce. `pumlex: Clear Cache` / `pumlex: Show Status` 진단 커맨드 추가.
- [x] **A-2** 서버 미가동 / 연결 실패 시 친절한 안내 — connection vs render 에러 구분, 서버 unreachable 시 시작 명령 안내 + `↻ 재시도` 버튼 (`vscode://archi-duke.pumlex/retry` URI handler가 error cache만 비우고 refresh)
- [x] **A-3** 라이트백(commit) 후 미리보기 자동 refresh — cache 전체 clear 제거 (변경된 블록만 cache miss로 자연스럽게 재fetch). 다른 블록은 cache hit으로 깜빡임 없이 유지.

## B. 다른 extension과 공존  ★

- [ ] **B-1** `jebbs.plantuml` 동시 활성화 시 fence 마커로 분리 (예: 메타 유무 기반 또는 `plantuml-pumlex` 마커)
- [ ] **B-2** Markdown Preview Enhanced (MPE) 통합 (MPE는 자체 webview 사용)

## C. 배포 / 패키징  ★★★

- [x] **C-1** `vsce package` → `.vsix` 빌드 — `npm run package`로 `pumlex-0.0.1.vsix` 생성. `code --install-extension <vsix>` 로 설치 가능. LICENSE / .vscodeignore 추가.
- [x] **C-2** README 사용자 가이드 — `packages/pex-vscode/README.md` 신규 작성 (첫 실행 흐름, 명령, 설정, CSP 메모, 트러블슈팅, 알려진 제약). 루트 README 에서 링크 + docs / architecture / ROADMAP 안내 섹션 추가.
- [ ] **C-3** `pumlex.serverUrl` 설정 변경 시 캐시 무효화 동작 검증

## D. UX 다듬기  ★

- [ ] **D-1** 큰 다이어그램 첫 로딩 placeholder 시간 측정 + 필요 시 progress 인디케이터
- [ ] **D-2** 메타 없는 블록 처음 편집 시 메타 자동 추가 흐름 검증

## E. 기능 보강 (장기)

- [ ] **E-0** 컨테이너(rectangle/package/node 등) 자동 리사이즈 — 내부 엔티티가 드래그로 이동하면 감싸는 컨테이너 크기가 그에 맞게 자동 조정. 현재는 컨테이너가 고정 크기라 내부 요소가 밖으로 나가거나 빈 공간이 생김. 부모-자식 관계는 SVG 의 nested `g.entity` 또는 PlantUML source 에서 추출.
- [ ] **E-1** Multi-select / group move
- [ ] **E-2** Qualified-name 변경 시 layout 마이그레이션 — 소스에서 엔티티 rename 시 메타의 `nodes`/`edges` 키도 따라 갱신. 미구현 시 dx/dy 와 곡선 anchor 가 조용히 손실됨. 접근 후보: (a) 명시적 `pumlex: Rename entity in layout` 명령, (b) PlantUML alias (`A as B`) 활용, (c) 구조 heuristic (위험).
- [ ] ~~**E-3** plantumlEx 측 저장된 다이어그램 list / 검색 페이지~~ — **보류** (2026-04-30, 모노레포 전환으로 우선순위 낮아짐).
- [ ] **E-4** 시퀀스 / 활동 다이어그램 인라인 편집 지원 — 현재 `pex-inline.js` 는 SVG `g.entity` 만 드래그 대상으로 잡음. 시퀀스(`participant`/`message`/`lifeline`)는 participant 가로 재배치, 활동(class 없는 `rect`/`polygon`/`ellipse`)은 노드 단위 식별·이동. 각각 별도 layout 모델 필요.

## F. 문서

- [x] **F-1** `docs/architecture.md` 현재 상태 반영 — 모노레포 구조, 소스 내장 메타 (`' @startmeta`), `PexInline.activate` 인라인 편집, `/render-with-layout` 단일 엔드포인트, VS Code 확장 + demo-host 클라이언트 모델로 재작성.
- [x] **F-2** `demo-host.html` GitHub Pages 게시 — `docs/` 스테이징 + `scripts/build-demo.js` 로 idempotent 재생성 (`npm run build:demo`). 런타임 서버 URL resolver (`?server=` → localStorage → localhost:3030) + setup 배너.

---

## 진행 로그

작업 완료 시 날짜 + 커밋 해시 + 한 줄 요약을 추가.

- 2026-04-29: 초기 ROADMAP 정리, 안정성 작업부터 시작.
- 2026-04-29: **A-1 / A-3** 완료 — refresh fallback + debounce, commit 후 cache 미clear (변경 블록만 자연 재fetch). 진단 커맨드 추가.
- 2026-04-29: **A-2** 완료 — connection error 분리 + 안내 + 재시도 URI 흐름. **A 카테고리 (안정성) 전체 완료**.
- 2026-04-29: **C-1** 완료 — vsce 통한 .vsix 빌드. 사내 배포 / `code --install-extension` 설치 가능.
- 2026-04-29: **모노레포 마이그레이션 완료** — `archi-duke/plantumlEx` 를 `packages/pex-server` 로 subtree merge (히스토리 보존), `pex-core` 추출, npm workspaces 구성. 단일 origin: archi-duke/pumlex.
- 2026-04-30: 샘플 정리 — 시퀀스/활동 다이어그램은 현재 `g.entity` 가 없어 편집 불가, 컴포넌트/상태 다이어그램으로 교체. 한계는 **E-4** 로 후속 추적.
- 2026-04-30: **F-1 / F-2** 완료 — architecture.md 모노레포 기준 재작성, GitHub Pages 데모 (`docs/` + `scripts/build-demo.js`) 스테이징.
- 2026-04-30: **C-2** 완료 — `packages/pex-vscode/README.md` 사용자 가이드 신규, 루트 README 에 가이드 / 데모 / 아키텍처 / 로드맵 링크.

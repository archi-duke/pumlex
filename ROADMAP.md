# pumlex roadmap

기능 + 안정성 작업 목록. 항목이 끝날 때마다 체크박스 갱신.

상관 레포: [archi-duke/plantumlEx](https://github.com/archi-duke/plantumlEx) (서버·`pex-inline.js` 본체).

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
- [ ] **C-2** README 사용자 가이드 (plantumlEx 서버 실행, CSP 설정, 첫 실행 흐름)
- [ ] **C-3** `pumlex.serverUrl` 설정 변경 시 캐시 무효화 동작 검증

## D. UX 다듬기  ★

- [ ] **D-1** 큰 다이어그램 첫 로딩 placeholder 시간 측정 + 필요 시 progress 인디케이터
- [ ] **D-2** 메타 없는 블록 처음 편집 시 메타 자동 추가 흐름 검증

## E. 기능 보강 (장기)

- [ ] **E-1** Multi-select / group move
- [ ] **E-2** Qualified-name 변경 시 layout 마이그레이션
- [ ] **E-3** plantumlEx 측 저장된 다이어그램 list / 검색 페이지

## F. 문서

- [ ] **F-1** 두 레포의 `docs/architecture.md` 현재 상태 반영
- [ ] **F-2** plantumlEx의 `demo-host.html` GitHub Pages 게시 (체험용)

---

## 진행 로그

작업 완료 시 날짜 + 커밋 해시 + 한 줄 요약을 추가.

- 2026-04-29: 초기 ROADMAP 정리, 안정성 작업부터 시작.
- 2026-04-29: **A-1 / A-3** 완료 — refresh fallback + debounce, commit 후 cache 미clear (변경 블록만 자연 재fetch). 진단 커맨드 추가.
- 2026-04-29: **A-2** 완료 — connection error 분리 + 안내 + 재시도 URI 흐름. **A 카테고리 (안정성) 전체 완료**.
- 2026-04-29: **C-1** 완료 — vsce 통한 .vsix 빌드. 사내 배포 / `code --install-extension` 설치 가능.

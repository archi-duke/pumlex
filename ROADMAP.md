# pumlex roadmap

기능 + 안정성 작업 목록. 항목이 끝날 때마다 체크박스 갱신.

상관 레포: [archi-duke/plantumlEx](https://github.com/archi-duke/plantumlEx) (서버·`pex-inline.js` 본체).

---

## A. 안정성 / 견고성  ★★★

- [ ] **A-1** 첫 fetch 후 placeholder → SVG 자동 전환 (`markdown.api.reloadPlugins` 동작 검증, 실패 시 대안)
- [ ] **A-2** 서버 미가동 / 연결 실패 시 친절한 안내 (재시도, 서버 시작 가이드)
- [ ] **A-3** 라이트백(commit) 후 미리보기에서 stale SVG 보이는 케이스 점검 + 자동 refresh

## B. 다른 extension과 공존  ★

- [ ] **B-1** `jebbs.plantuml` 동시 활성화 시 fence 마커로 분리 (예: 메타 유무 기반 또는 `plantuml-pumlex` 마커)
- [ ] **B-2** Markdown Preview Enhanced (MPE) 통합 (MPE는 자체 webview 사용)

## C. 배포 / 패키징  ★★★

- [ ] **C-1** `vsce package` → `.vsix` 빌드, 사내 배포 가능 형태
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

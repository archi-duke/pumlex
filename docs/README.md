# pumlex — GitHub Pages 데모

이 디렉토리는 GitHub Pages 에 게시되는 정적 호스팅용입니다 (`https://archi-duke.github.io/pumlex/`).

## 동작 방식

- `index.html` 은 `packages/pex-server/public/demo-host.html` 의 GitHub Pages 적응 사본
- `pex-core/{geom,meta,inline}.js` 는 `packages/pex-core/` 의 사본
- PlantUML 렌더링은 **로컬 plantumlEx 서버** (`http://localhost:3030`) 를 호출 (정적 호스팅이라 서버 사이드 처리 불가)

## 사용자가 할 일

1. 페이지 접속: `https://archi-duke.github.io/pumlex/`
2. 상단 setup 배너에 따라 로컬 `pex-server` 실행 (`npm run start:server`)
3. 필요 시 서버 URL 변경 (`?server=…` 쿼리 또는 배너 입력란)

## 재빌드

`packages/pex-server/public/demo-host.html` 또는 `packages/pex-core/*.js` 를 수정한 뒤:

```bash
npm run build:demo
```

스크립트가 자동으로 사본을 갱신하고 `index.html` 의 정적 자산 경로를 패치합니다.

## GitHub Pages 활성화

레포 Settings → Pages → Branch: `main`, Folder: `/docs`. 첫 활성화 후 1~2분 안에 게시됩니다.

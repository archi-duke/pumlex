# pumlex — Architecture

## 1. Overview

pumlex 는 **PlantUML 다이어그램의 시각적 미세조정(fine-tune) 을 PlantUML 소스 안에 자체 포함시키는 모노레포**다. 사용자가 GUI 로 노드를 드래그하면, 그 위치 변화는 PlantUML 소스 끝의 메타 블록에 JSON 으로 임베드되어 한 파일로 보존된다.

```
[편집] markdown editor (또는 demo-host) → 인라인 드래그 → 소스 + meta 한 덩어리로 저장
[렌더] source → /render-with-layout → PlantUML 렌더 + meta 적용 → 최종 SVG
```

핵심 설계 원칙

- **소스 한 파일.** layout delta 가 별도 DB/저장소가 아니라 PlantUML source 끝의 `' @startmeta` ~ `' @endmeta` 주석 블록에 임베드된다.
- **편집 = inline.** 별도 에디터 SPA 없이 markdown preview 또는 호스트 페이지의 `<svg>` 위에 오버레이 핸들이 뜬다.
- **공용 코어.** geom / meta / inline 모듈은 브라우저·Node 양쪽에서 동일하게 동작 (UMD).
- **서버는 합성만.** PlantUML jar 호출 + meta delta 적용 + 컨테이너 리사이즈 + viewBox 보정. 영속 저장 없음.
- **이름 변경(rename) 자동 마이그레이션.** 1:1 또는 substring 일치 시 메타 키를 새 이름으로 자동 이전.

## 2. Monorepo Layout

```
pumlex/
├── packages/
│   ├── pex-core/        ← geom + meta + inline (공용 모듈, UMD)
│   │   ├── geom.js      엔티티 bbox / 엣지 경로 / 곡선 빌더
│   │   ├── meta.js      ' @startmeta 블록 parse/embed + rename 마이그레이션
│   │   └── inline.js    SVG 위 인라인 에디터 (드래그/선택/곡선 핸들)
│   ├── pex-server/      ← Express 렌더링 서버
│   │   ├── server.js    /render, /render-with-layout, /diagrams (옵션)
│   │   └── public/      edit.html, demo-host.html
│   └── pex-vscode/      ← VS Code Markdown 미리보기 확장 ("pumlex")
│       ├── src/         markdownItPlugin, extension, URI handler
│       ├── media/       preview.js (주입 스크립트)
│       └── lib/         build 시 pex-core 로부터 복사 (vsce 패키징용)
├── ROADMAP.md
├── README.md
└── package.json         npm workspaces
```

`pex-core` 는 어느 패키지에서도 동일한 모듈을 보장하기 위해 양쪽이 `@archi-duke/pex-core` 로 의존한다. `pex-vscode` 는 vsce 가 `--no-dependencies` 로 패키징하므로 빌드 단계 (`scripts/copy-core.js`) 에서 `lib/pex-*.js` 로 복사한다.

## 3. Data Model — Source-Embedded Meta

PlantUML 소스 끝에 `' @startmeta` 블록을 임베드한다. 매 줄 `'` 코멘트라 PlantUML 파서가 무시한다.

```
@startuml
class Order { id: UUID }
class Customer { id: UUID }
Customer --> Order
@enduml

' @startmeta
' {
'   "schema": 1,
'   "layout": {
'     "nodes": {
'       "Order":    { "dx": 200, "dy": 50 }
'     },
'     "edges": {
'       "Customer__Order": {
'         "type": "curve",
'         "u1": { "x": 30, "y": -20 },
'         "u2": { "x": -30, "y": -20 },
'         "endAnchor": { "side": "left", "t": 0.5 }
'       }
'     }
'   }
' }
' @endmeta
```

키 규칙
- **Node**: `qualified-name` (PlantUML 의 `data-qualified-name` 속성과 일치). 컨테이너 자식은 `Parent.Child` 형식.
- **Edge**: `qname1__qname2` (양쪽 엔티티의 qname 을 `__` 로 연결).

값 의미
- `nodes[q].dx/dy`: 엔티티의 자연 위치에 대한 translate offset.
- `edges[k].type`: `straight` / `curve` / `ortho`.
- `edges[k].u1/u2`: 곡선 컨트롤 포인트 (start/end 에서의 오프셋).
- `edges[k].startAnchor/endAnchor`: 엔티티 bbox 위에서 line 이 닿는 점 (`side`: top/right/bottom/left, `t`: 0~1).

## 4. Components

### 4.1 pex-core/geom.js
- 엔티티 bbox 계산 (rect/ellipse/polygon/path/text 합집합)
- bbox 경계 점 / 곡선 컨트롤 포인트 / 다각형 화살촉 재배치
- 모든 함수가 **순수**. 브라우저·Node 양쪽에서 동일.

### 4.2 pex-core/meta.js
- `parseSource(full) → { source, meta }`
- `embedMeta(source, meta) → fullSource`
- `migrateRenamedKeys(svgQnames, layout)` — orphan 메타 키를 1:1 또는 substring 일치 fresh 엔티티로 자동 이전 (E-2 참조)

### 4.3 pex-core/inline.js
- `PexInline.activate(container, opts)` — SVG 위에 오버레이 layer 주입
- 엔티티: pointerdown → drag, multi-select (Shift+click), Esc 해제
- 엣지: 클릭 → toolbar (직선/곡선/꺾은선), 곡선 핸들 4개, anchor side 변경
- 컨테이너: 자식 이동 시 `<g class="cluster">` 의 rect 자동 리사이즈 (E-0)
- L2 draft: 미저장 변경을 localStorage 에 백업 + 재진입 시 복원 프롬프트

### 4.4 pex-server/server.js
주요 엔드포인트:

| 엔드포인트 | 역할 |
|---|---|
| `POST /render-with-layout` (text/plain) | source body → layout 적용된 SVG |
| `GET  /render-with-layout?src=…` | 같은 합성을 GET 으로 (img 태그용) |
| `POST /render` | 기본 PlantUML 렌더 (layout 적용 없음) |
| `GET  /demo-host.html` | 웹용 인라인 데모 페이지 |
| `GET  /pex-core/{geom,meta,inline}.js` | 클라이언트용 정적 자산 |
| `(옵션) POST /diagrams /diagrams/:id /layouts/:id` | 파일 기반 영속 (legacy PoC, 사용 안 해도 됨) |

`applyLayout()` 흐름:
1. PlantUML jar 호출로 raw SVG 생성 (`renderSvg`)
2. `parseSource` 로 source / meta 분리
3. `migrateRenamedKeys` 로 rename 자동 마이그레이션
4. cheerio 로 entity translate 추가
5. 엣지 path 재라우팅 (PexGeom 사용)
6. `resizeContainers`: cluster rect 를 자식 bbox 로 derive
7. `expandViewBox`: 새 SVG 경계 계산

### 4.5 pex-vscode (확장)
- `markdown-it` 플러그인이 ```` ```plantuml ```` fence 를 인터셉트
- 캐시 hit 시 inline SVG 즉시 반환, miss 시 placeholder + 백그라운드 fetch + reload
- 각 SVG 가 그려지면 `media/preview.js` 가 PexInline.activate 호출 (편집 가능)
- 커밋 (`✓ 완료`) → URI handler (`vscode://archi-duke.pumlex/commit?…`) → `WorkspaceEdit` 으로 source 갱신

## 5. Data Flow

### 5.1 첫 렌더 + 인라인 편집
```
markdown ```plantuml ... ```
   ↓ markdown-it fence
HTTP POST /render-with-layout (body=source+meta)
   ↓ pex-server
   PlantUML jar → applyLayout (rename + nodes + edges + clusters)
   ↓ cached SVG
markdown preview 에 inline SVG 주입
   ↓ preview.js
PexInline.activate(container) → 오버레이 핸들
   ↓ 사용자 드래그
state.layout 업데이트 (메모리)
   ↓ ✓ 완료
URI: vscode://archi-duke.pumlex/commit?source=…
   ↓ extension URI handler
WorkspaceEdit → 파일에 신규 source 적용
```

### 5.2 Rename 자동 마이그레이션
```
사용자가 source 에서 class Order 를 PurchaseOrder 로 rename
   ↓ 저장
markdown-it 캐시 miss → /render-with-layout
   ↓ server applyLayout
migrateRenamedKeys(["Customer","PurchaseOrder","Product"], { Order: {...} })
   - orphaned = ["Order"], fresh = ["Customer","PurchaseOrder","Product"]
   - 1:1 안 맞음 → substring 매칭 시도 → "order" ⊂ "purchaseorder" 1건 일치
   - { Order: "PurchaseOrder" } 마이그레이션, edges 키도 같이 갱신
   ↓ 후속 작업은 새 키로 진행
SVG: PurchaseOrder 에 translate(200, 50) 적용 → 레이아웃 보존됨
```

## 6. Tech Stack

| 레이어 | 현재 | 비고 |
|---|---|---|
| 모노레포 | npm workspaces | Lerna/Nx 불필요 |
| Backend | Node.js + Express | |
| Renderer | `java -jar plantuml.jar` (HTTP, server-mode) | `PLANTUML_URL=http://localhost:8080` |
| SVG 조작 | cheerio (서버) / 브라우저 DOM (클라) | |
| 클라이언트 모듈 | UMD pex-core (browser + Node) | |
| 저장소 | source 임베드 (기본) / 파일 JSON (legacy) | |
| VS Code 확장 | TypeScript + markdown-it 플러그인 | vsce 로 .vsix 패키징 |
| 인증 | 없음 | |

## 7. Known Limitations

ROADMAP.md 의 미완 항목 참고. 주요:

- **시퀀스 / 활동 다이어그램 인라인 편집 미지원** (E-4). PlantUML 이 `g.entity` 를 만들지 않고, participant/lifeline/노드 등 별도 layout 모델 필요.
- **Rename 마이그레이션은 1 orphan + 1 fresh (또는 substring 1건) 만 자동.** 그 외는 prompt UX 미구현 (E-2 보강 후속).
- **Multi-extension 공존** (B-1): jebbs.plantuml / Markdown Preview Enhanced 같이 켜면 fence 가로채기 충돌.
- **큰 다이어그램 progress 인디케이터** (D-1): 첫 placeholder → SVG 전환까지 시간 측정·표시 미구현.

## 8. Getting Started

```bash
# 모노레포 클론 후
npm install                          # 워크스페이스 심볼릭 링크 생성
npm run start:server                 # PORT=3030 (기본). PLANTUML_URL 필요

# 웹 데모
open http://localhost:3030/demo-host.html

# VS Code 확장 개발
code packages/pex-vscode             # F5 → Extension Development Host
# 또는 .vsix 빌드 후 설치
npm run package:vscode
code --install-extension packages/pex-vscode/pumlex-*.vsix
```

PlantUML 서버: jar 직접 또는 `picoweb` 모드 권장 (`java -jar plantuml.jar -picoweb:8080`).

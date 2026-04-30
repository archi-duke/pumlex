# pumlex 샘플

이 문서는 pumlex 익스텐션 동작을 확인하기 위한 샘플입니다. VS Code의 마크다운 미리보기(`Cmd+Shift+V` 또는 `Cmd+K V`)에서 아래 plantuml 블록이 SVG로 교체되어야 합니다.

## 클래스 다이어그램

```plantuml
@startuml
class Customer {
   id: UUID
   name: String
}
class Order {
   id: UUID
}
class Product {
   sku: String
}
Customer "1" --> "*" Order
Order "*" --> "*" Product
@enduml

' @startmeta
' {
'   "schema": 1,
'   "layout": {
'     "nodes": {
'       "Order": {
'         "dx": 266,
'         "dy": 1
'       }
'     },
'     "edges": {
'       "Order__Product": {
'         "type": "curve",
'         "u2": {
'           "x": -83.11315059661865,
'           "y": -0.9882284440632816
'         },
'         "u1": {
'           "x": -68.69726470280636,
'           "y": 9.860203842849629
'         }
'       },
'       "Customer__Order": {
'         "type": "curve",
'         "u2": {
'           "x": 115.6683521270752,
'           "y": 2.595307463436086
'         },
'         "u1": {
'           "x": 109.66627502441406,
'           "y": 6.415127849936411
'         }
'       }
'     }
'   }
' }
' @endmeta
```

## 유스케이스 다이어그램 (메타 임베드 포함)

```plantuml
@startuml
left to right direction
actor Admin
rectangle System {
  usecase "Manage Users" as UC1
  usecase "View Reports" as UC2
}
Admin --> UC1
Admin --> UC2
@enduml

' @startmeta
' {
'   "schema": 1,
'   "layout": {
'     "nodes": {
'       "Admin": {
'         "dx": 375,
'         "dy": -7
'       }
'     },
'     "edges": {
'       "Admin__System.UC2": {
'         "type": "curve",
'         "u2": {
'           "x": -50.22406005859375,
'           "y": 3.7730712890625
'         },
'         "u1": {
'           "x": -65.50314331054688,
'           "y": 3.697214489706468
'         },
'         "endAnchor": {
'           "side": "right",
'           "t": 0.6021368444364396
'         }
'       },
'       "Admin__System.UC1": {
'         "type": "curve",
'         "u2": {
'           "x": -74.44454193115234,
'           "y": -2.7033538818359375
'         },
'         "u1": {
'           "x": -51.35821533203125,
'           "y": 4.023026870987209
'         },
'         "endAnchor": {
'           "side": "right",
'           "t": 0.6717736059495666
'         }
'       }
'     }
'   }
' }
' @endmeta
```

위 두 번째 블록은 `Admin` 액터를 380px 우측으로 이동하는 메타가 임베드되어 있어 미리보기에서 그대로 반영되어야 합니다.

## 메타 없는 클래스 (첫 편집 시 메타 자동 추가 검증용)

이 블록은 `' @startmeta` 블록이 없습니다. ✎ 편집 → 엔티티 드래그 → ✓ 완료 시 마크다운에 메타가 새로 끼어들어가야 합니다.

```plantuml
@startuml
class Account {
  +id: UUID
  +balance: Decimal
}
class Transaction {
  +id: UUID
  +amount: Decimal
  +ts: Instant
}
Account "1" --> "*" Transaction
@enduml
```

## 컴포넌트 다이어그램

```plantuml
@startuml
[Web UI] as UI
[API Server] as API
database "PostgreSQL" as DB
queue "Message Queue" as MQ
UI --> API
API --> DB
API --> MQ
@enduml
```

## 상태 다이어그램

```plantuml
@startuml
[*] --> Idle
Idle --> Loading : fetch
Loading --> Ready : ok
Loading --> Error : fail
Ready --> [*]
Error --> Idle : retry
@enduml
```

## 일반 코드 블록 (변형 안 됨)

```python
print("hello")
```

```bash
echo "이 블록도 plantumlEx 가 건드리지 않아야 합니다"
```

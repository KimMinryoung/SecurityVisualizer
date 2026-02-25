# Mistakes Log

_Track mistakes here to avoid repeating them._

## 5. MAC OUI 조회 — 랜덤 MAC과 자기 자신 ARP 누락

**Mistake:**
- OUI 룩업 기능 구현 시 두 가지 경우를 사전에 고려하지 않음:
  1. **랜덤 MAC (Locally Administered Address)**: iOS/Android의 Wi-Fi 개인정보 보호 기능으로 접속마다 MAC이 무작위 생성됨. OUI DB에 존재하지 않아 조회가 원천 불가.
  2. **자기 자신의 MAC**: `arp -a`는 타 장비를 찾기 위한 프로토콜이므로 자기 자신의 IP/MAC을 ARP 테이블에 포함하지 않음. 스캔으로 등록된 내 PC는 `mac_address = NULL` 상태가 됨.

**Symptoms:**
- 스캔으로 등록된 스마트폰/태블릿: vendor = NULL (OUI dict miss)
- 내 PC: mac_address = NULL → vendor 계산 불가

**Fix:**
- 랜덤 MAC 감지: 첫 바이트 bit1 (`first_byte & 0x02`) 이 1이면 "랜덤 MAC" 반환
- 내 PC MAC: `ipconfig /all`의 Physical Address 파싱으로 취득 (`ipconfig`만으로는 MAC 미포함)
- `whoami` 엔드포인트에 `local_macs: {ip: mac}` 추가, App.jsx에서 OS 패치 시 MAC도 함께 패치

**Rule:**
- OUI 조회 전 항상 Locally Administered bit 체크를 먼저 수행할 것
- 로컬 장비 정보 수집 시 `ipconfig /all` 사용 (`ipconfig`는 MAC 미포함)
- ARP 기반 MAC 수집은 타 장비 전용임을 전제할 것

---

## 4. Cytoscape data.id vs backend integer id — DevicePanel API 호출 실패

**Mistake:** `toElements`에서 `id: node.id` ("dev-1")가 `...node.data`의 `id: 1`을 덮어씀.
결과적으로 `selectedNode.data.id` = `"dev-1"` → `api.getDevice("dev-1")` → 404 → `device` null → 버튼 미렌더링.

**Fix:** 백엔드 정수 id를 `deviceId`로 별도 보존:
```js
data: { ...node.data, id: node.id, deviceId: node.data?.id, ... }
```
DevicePanel에서 `selectedNode.data.deviceId`로 API 호출.

**Rule:** Cytoscape용 `id`와 API용 `id`를 반드시 분리해서 저장할 것.

---

## 2. Cytoscape element data — id overwrite by object spread

**Mistake:**
```js
data: {
  id: node.id,    // "dev-1"
  ...node.data,   // contains id:1 (integer) — overwrites "dev-1"!
}
```
**Effect:** Cytoscape node id becomes integer `1`, but edges reference string `"dev-1"` → edges don't connect → blank graph.

**Fix:** Always put `id: node.id` AFTER the spread:
```js
data: {
  ...node.data,
  id: node.id,    // overrides the backend integer id
}
```

## 3. Cytoscape compound nodes + breadthfirst layout

**Mistake:** Used `parent` field for compound nodes with `breadthfirst` layout.
`breadthfirst` does not support compound graphs → silent layout failure.

**Fix:** Remove compound nodes for MVP. Use flat graph + edges to show membership.
Use `cose` layout (built-in, force-directed, no plugins needed).

---

## 1. SQLAlchemy 2.x joinedload with string attribute names

**Mistake:** Used string-based relationship names in joinedload chains:
```python
.options(joinedload(Device.device_solutions).joinedload("solution"))
```
**Error:** `sqlalchemy.exc.ArgumentError: Strings are not accepted for attribute names in loader options`

**Fix:** Always use class-bound attributes:
```python
.options(joinedload(Device.device_solutions).joinedload(DeviceSolution.solution))
```
**Rule:** In SQLAlchemy 2.x, `joinedload()` chains must use model class attributes, not strings.

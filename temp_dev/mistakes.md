# Mistakes Log

_Track mistakes here to avoid repeating them._

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

# SecurityVisualizer — Development Plan

## Current Phase: Phase 1 — Foundation

### Status: COMPLETE

---

## Phase 1 — Foundation
**Goal: runnable app showing topology graph with manually entered data**

### Backend Tasks
- [x] FastAPI app with CORS, SQLAlchemy + SQLite
- [x] ORM models: Network, Device, SecuritySolution, DeviceSolution
- [x] Pydantic schemas (separate input/output)
- [x] CRUD routers: networks, devices, solutions
- [x] `/api/topology` endpoint
- [x] Seed script with sample data

### Frontend Tasks
- [x] Vite + React project
- [x] Cytoscape.js graph canvas
- [x] Layout: top toolbar | center graph | right panel
- [x] Load topology from API on mount
- [x] Click node → show device details in right panel
- [x] Add Device modal form (POST to /api/devices)

### Success Criteria
- `uvicorn app.main:app` starts backend on :8000
- `GET http://localhost:8000/api/topology` returns nodes + edges JSON
- `npm run dev` starts frontend on :5173
- Topology graph renders devices as nodes, grouped by network
- Clicking a device node shows its details
- "Add Device" form → submits → new node appears in graph

---

## Phase 2 — Coverage Visualization (NEXT)
- Assign/unassign security solutions to devices via UI
- Node color coding: green (full coverage), yellow (partial), red (missing critical)
- Filter panel: highlight by solution type
- Coverage summary stats in toolbar

## Phase 3 — Network Scanning
- python-nmap wrapper for subnet scanning
- POST /api/scan endpoint
- Frontend scan dialog with CIDR input

## Phase 4 — Vulnerability Tracking (post-MVP)
- CVE per device, severity color overlay
- Patch/install fix recommendations

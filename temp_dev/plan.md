# SecurityVisualizer — Development Plan

## Current Phase: Phase 6 — Device Vendor Identification

### Status: COMPLETE

---

## Phase 1 — Foundation
**Status: COMPLETE**

- [x] FastAPI app with CORS, SQLAlchemy + SQLite
- [x] ORM models: Network, Device, SecuritySolution, DeviceSolution
- [x] Pydantic schemas (separate input/output)
- [x] CRUD routers: networks, devices, solutions
- [x] `/api/topology` endpoint
- [x] Vite + React + Cytoscape.js frontend
- [x] Click node → device details panel
- [x] Add Device modal form

---

## Phase 2 — Coverage Visualization
**Status: COMPLETE**

- [x] Assign/unassign security solutions to devices via UI
- [x] Node color coding: green (full coverage), yellow (partial), red (none)
- [x] Coverage toggle (🛡️) in toolbar
- [x] Filter chips by solution type
- [x] Coverage stats badge in toolbar

---

## Phase 3 — Network Scanning
**Status: COMPLETE**

- [x] ipconfig-based auto-scan (no nmap dependency)
- [x] Parallel ping + ARP for host discovery
- [x] Gateway role detection from interfaces
- [x] Dedup by IP and hostname
- [x] `/api/scan/interfaces` + `/api/scan/` endpoints
- [x] ScanDialog in frontend (no manual CIDR input)
- [x] My PC auto-detect via `/api/whoami`

---

## Phase 4 — Vulnerability Tracking
**Status: COMPLETE**

- [x] DeviceVulnerability ORM model + CRUD
- [x] Vuln severity color overlay on graph (🐛 toggle)
- [x] Severity filter chips + stats badge
- [x] DevicePanel: add / patch status / delete vuln form

---

## Phase 5 — OS-based Vulnerability Autoscan
**Status: COMPLETE**

- [x] `backend/app/vuln_rules.py` — 12개 OS/플랫폼 룰셋 (Windows, Linux, Cisco, Fortinet, PAN-OS, macOS)
- [x] `POST /api/devices/{id}/vulnerabilities/autoscan` — OS 매칭 + dedup + 일괄 등록
- [x] `PATCH /api/devices/{id}` — 장비 필드 부분 업데이트 (os, mac_address, vendor)
- [x] `/api/whoami` 확장 — `local_ips`, `local_macs`, `os` 반환 (ipconfig /all 파싱)
- [x] App.jsx — 로컬 인터페이스 IP로 내 PC 매칭 후 OS·MAC 자동 기입
- [x] DevicePanel — 🔍 OS 기반 자동 스캔 버튼 (OS 없으면 비활성화, 결과 메시지 표시)

### 한계 (알려진 제약)
- `whoami`의 `local_ips`/`local_macs`/`os`는 백엔드 실행 머신 기준 → 로컬 개발 환경 전용
- 배포 환경에서는 외부 데이터 연동(보안솔루션 운영 서버 등)으로 대체 필요

---

## Phase 6 — Device Vendor Identification
**Status: COMPLETE**

- [x] `backend/app/oui.py` — IEEE OUI DB 내장 (~800개 항목, 주요 소비자·기업 장비 망라)
- [x] 랜덤 MAC 감지 — Locally Administered Address(bit1=1) 자동 판별 → "랜덤 MAC" 표시
- [x] Device 모델에 `vendor` 컬럼 추가 + DB 자동 마이그레이션 (ALTER TABLE + backfill)
- [x] `create_device` — MAC → OUI 룩업 → vendor 자동 저장
- [x] `patch_device` — MAC 업데이트 시 vendor 자동 계산
- [x] ScanDialog — 스캔 결과에 제조사 표시 (파란 글씨)
- [x] DevicePanel — Vendor 행 추가 (MAC 바로 아래)

### 알려진 제약
- 랜덤 MAC 장비(iOS/Android Wi-Fi 개인정보 보호): OUI 조회 불가, "랜덤 MAC" 표시
- 해당 장비의 실제 기기 확인은 공유기 DHCP 클라이언트 목록 이용 필요

---

## Phase 7 — 공유기 클라이언트 자동 가져오기
**Status: COMPLETE**

- [x] `backend/app/routers/router_import.py` — Playwright 기반 TP-Link 스크래퍼
  - Object.defineProperty로 CryptoJS.AES.decrypt 즉시 훅
  - "유선 클라이언트" / "무선 클라이언트" 버튼 클릭 후 DOM 테이블 직접 읽기 (핵심)
  - IP 정규식으로 행 감지, 순번 열 자동 제외
  - `POST /api/router/clients` 엔드포인트
- [x] `backend/app/main.py` — router_import_router 등록
- [x] `frontend/src/api/client.js` — `fetchRouterClients` 추가
- [x] `frontend/src/components/RouterImportDialog.jsx` — 비밀번호 입력 + 클라이언트 목록 + DB 가져오기
- [x] `frontend/src/components/Toolbar.jsx` — 📡 공유기 버튼 추가

### 사전 요구사항 (Playwright 미설치 시)
```
pip install playwright
playwright install chromium
```
백엔드가 playwright 없이 시작되어도 오류 없음 (엔드포인트 호출 시에만 503 반환)

### 검증 완료 (Archer C6 v2.0 firmware 1.3.2 Build 20220304)
- 유선 1개 + 무선 5개 = 총 6개, IP/MAC/호스트네임 정상 수집

### 알려진 제약
- TP-Link 펌웨어 버전에 따라 버튼 텍스트/DOM 구조가 다를 수 있음
- 응답이 AES 암호화되어 있으나 DOM 읽기로 우회 (암호화 방식 무관)
- headless 브라우저이므로 공유기 로그인까지 ~15-30초 소요

---

## Phase 8 — 다음 후보 (미정)

- 장비별 위험 점수(Risk Score) 계산 및 표시
- 취약점 → 보안 솔루션 권고 매핑
- 외부 데이터 연동 API (보안솔루션 운영 서버 → OS/취약점 자동 동기화)
- 사용자 인증 및 접근 제어

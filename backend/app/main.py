import platform
import sys

from fastapi import FastAPI, Request
from fastapi.middleware.cors import CORSMiddleware

from .database import engine
from . import models
from .routers import networks, devices, topology, scan
from .routers.scan import _get_interfaces
from .routers.solutions import sol_router, assign_router
from .routers.vulnerabilities import router as vuln_router
from .routers.router_import import router as router_import_router
from .routers.bluetooth import router as bluetooth_router

models.Base.metadata.create_all(bind=engine)

# 기존 DB 에 신규 컬럼 추가 + 기존 장비 vendor 역채움 + 네트워크 중복 제거
def _migrate():
    from .database import SessionLocal
    from .oui import lookup as oui_lookup
    import sqlalchemy
    db = SessionLocal()
    try:
        db.execute(sqlalchemy.text("ALTER TABLE devices ADD COLUMN vendor TEXT"))
        db.commit()
    except Exception:
        pass  # 이미 존재하면 무시
    try:
        rows = db.execute(sqlalchemy.text(
            "SELECT id, mac_address FROM devices "
            "WHERE mac_address IS NOT NULL AND (vendor IS NULL OR vendor = '')"
        )).fetchall()
        for row in rows:
            v = oui_lookup(row[1] or "")
            if v:
                db.execute(sqlalchemy.text(
                    "UPDATE devices SET vendor = :v WHERE id = :id"
                ), {"v": v, "id": row[0]})
        db.commit()
    except Exception:
        pass
    
    # 네트워크 중복 제거: 서브넷이 중복인 경우 하나만 남기고 삭제
    try:
        duplicates = db.execute(sqlalchemy.text(
            "SELECT subnet, COUNT(*) as cnt FROM networks GROUP BY subnet HAVING cnt > 1"
        )).fetchall()
        for dup in duplicates:
            subnet = dup[0]
            nets = db.execute(
                sqlalchemy.text("SELECT id FROM networks WHERE subnet = :subnet"),
                {"subnet": subnet}
            ).fetchall()
            for net_id in nets[1:]:
                devices_in_net = db.execute(
                    sqlalchemy.text("SELECT id FROM devices WHERE network_id = :nid"),
                    {"nid": net_id[0]}
                ).fetchall()
                target_net_id = nets[0][0]
                for dev in devices_in_net:
                    db.execute(
                        sqlalchemy.text("UPDATE devices SET network_id = :tid WHERE id = :did"),
                        {"tid": target_net_id, "did": dev[0]}
                    )
                db.execute(
                    sqlalchemy.text("DELETE FROM networks WHERE id = :nid"),
                    {"nid": net_id[0]}
                )
            db.commit()
    except Exception:
        pass
    
    # 서브넷 유니크 인덱스 추가
    try:
        db.execute(sqlalchemy.text("CREATE UNIQUE INDEX IF NOT EXISTS uq_networks_subnet ON networks (subnet)"))
        db.commit()
    except Exception:
        pass
    finally:
        db.close()

_migrate()

app = FastAPI(title="SecurityVisualizer API", version="1.0.0")

app.add_middleware(
    CORSMiddleware,
    allow_origins=["http://localhost:5173"],
    allow_credentials=True,
    allow_methods=["*"],
    allow_headers=["*"],
)

app.include_router(networks.router)
app.include_router(devices.router)
app.include_router(sol_router)
app.include_router(assign_router)
app.include_router(topology.router)
app.include_router(scan.router)
app.include_router(vuln_router)
app.include_router(router_import_router)
app.include_router(bluetooth_router)


def _local_os() -> str:
    """로컬 머신 OS 문자열 반환. 자동 스캔 룰셋 매칭용."""
    system = platform.system()
    if system == "Windows":
        build = sys.getwindowsversion().build if hasattr(sys, "getwindowsversion") else 0
        release = "11" if build >= 22000 else platform.release()
        return f"Windows {release}"
    if system == "Darwin":
        return f"macOS {platform.mac_ver()[0]}"
    try:
        with open("/etc/os-release") as f:
            for line in f:
                if line.startswith("PRETTY_NAME="):
                    return line.split("=", 1)[1].strip().strip('"')
    except OSError:
        pass
    return f"{system} {platform.release()}"


@app.get("/api/whoami")
def whoami(request: Request):
    """접속자의 IP, 로컬 인터페이스 IP·MAC 목록, OS 정보를 반환."""
    forwarded = request.headers.get("X-Forwarded-For")
    ip = forwarded.split(",")[0].strip() if forwarded else request.client.host
    ifaces = _get_interfaces()
    local_ips = [iface["ip"] for iface in ifaces]
    local_macs = {iface["ip"]: iface["mac"] for iface in ifaces if iface.get("mac")}
    return {"ip": ip, "local_ips": local_ips, "local_macs": local_macs, "os": _local_os()}


@app.get("/")
def root():
    return {"status": "ok", "app": "SecurityVisualizer"}

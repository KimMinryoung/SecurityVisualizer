import ipaddress
import socket
import subprocess
import re
import concurrent.futures
from typing import List, Optional

from fastapi import APIRouter, Depends, HTTPException
from sqlalchemy.orm import Session
from pydantic import BaseModel

from ..database import get_db
from ..models import Device

router = APIRouter(prefix="/api/scan", tags=["scan"])


class ScanRequest(BaseModel):
    cidr: str


class ScanResult(BaseModel):
    ip_address: str
    hostname: str
    mac_address: Optional[str] = None
    already_registered: bool = False


def _ping(ip: str) -> bool:
    try:
        r = subprocess.run(
            ['ping', '-n', '1', '-w', '800', ip],
            capture_output=True, timeout=5
        )
        return r.returncode == 0
    except Exception:
        return False


def _hostname(ip: str) -> str:
    try:
        name = socket.gethostbyaddr(ip)[0]
        # 짧은 이름만 사용 (FQDN에서 첫 부분)
        return name.split('.')[0]
    except Exception:
        return ip


def _arp_table() -> dict:
    """시스템 ARP 테이블에서 {ip: mac} 반환"""
    mac_map = {}
    try:
        r = subprocess.run(['arp', '-a'], capture_output=True, text=True, timeout=5)
        for line in r.stdout.splitlines():
            # Windows: "  192.168.1.1    aa-bb-cc-dd-ee-ff    dynamic"
            m = re.match(r'\s+([\d.]+)\s+([\w-]{17})\s+\w+', line)
            if m:
                ip = m.group(1)
                mac = m.group(2).upper().replace('-', ':')
                mac_map[ip] = mac
    except Exception:
        pass
    return mac_map


@router.post("/", response_model=List[ScanResult])
def scan_network(payload: ScanRequest, db: Session = Depends(get_db)):
    try:
        net = ipaddress.ip_network(payload.cidr, strict=False)
    except ValueError:
        raise HTTPException(status_code=400, detail="잘못된 CIDR 형식입니다 (예: 192.168.1.0/24)")

    hosts = list(net.hosts())
    if len(hosts) > 1024:
        raise HTTPException(status_code=400, detail="서브넷이 너무 큽니다 (최대 /22, 1024개)")

    # 병렬 ping sweep
    live: List[str] = []
    with concurrent.futures.ThreadPoolExecutor(max_workers=64) as pool:
        future_to_ip = {pool.submit(_ping, str(ip)): str(ip) for ip in hosts}
        for future in concurrent.futures.as_completed(future_to_ip):
            ip = future_to_ip[future]
            try:
                if future.result():
                    live.append(ip)
            except Exception:
                pass

    # ping 후 ARP 테이블 조회 (ping이 ARP를 채움)
    arp = _arp_table()
    existing_devices = db.query(Device).all()
    existing_ips = {d.ip_address for d in existing_devices}
    # hostname 기준 중복 체크 (같은 PC가 여러 어댑터로 잡히는 경우 방지)
    existing_hostnames = {d.hostname.lower() for d in existing_devices if d.hostname}

    results = []
    seen_hostnames: set = set()  # 이번 스캔 내 중복 제거용

    for ip in sorted(live, key=ipaddress.ip_address):
        hostname = _hostname(ip)
        hostname_key = hostname.lower()

        # DB에 같은 IP 또는 같은 hostname이 이미 있으면 등록됨으로 표시
        already = ip in existing_ips or (
            hostname_key != ip.lower() and hostname_key in existing_hostnames
        )

        # 이번 스캔 내에서 같은 hostname이 이미 나왔으면 (다른 어댑터) 건너뜀
        if hostname_key != ip.lower() and hostname_key in seen_hostnames:
            continue
        seen_hostnames.add(hostname_key)

        results.append(ScanResult(
            ip_address=ip,
            hostname=hostname,
            mac_address=arp.get(ip),
            already_registered=already,
        ))

    return results

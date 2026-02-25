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
    role: Optional[str] = None   # 예: "Wi-Fi 기본 게이트웨이"


class InterfaceInfo(BaseModel):
    ip: str
    cidr: str
    adapter: str = ''
    gateway: Optional[str] = None


def _get_interfaces() -> list:
    """
    ipconfig를 파싱해 로컬 IPv4 인터페이스 목록 반환.
    어댑터 이름, 서브넷 CIDR, 기본 게이트웨이를 함께 추출한다.
    """
    try:
        result = subprocess.run(['ipconfig'], capture_output=True, timeout=10)
        output = ''
        for enc in ('utf-8', 'cp949', 'euc-kr'):
            try:
                output = result.stdout.decode(enc)
                break
            except Exception:
                continue

        interfaces = []

        # 어댑터별로 섹션을 나눠 파싱
        current_adapter = ''
        current_ip = None
        current_mask = None
        current_gw = None

        def _flush():
            nonlocal current_ip, current_mask, current_gw
            if current_ip and current_mask:
                try:
                    net = ipaddress.IPv4Network(f'{current_ip}/{current_mask}', strict=False)
                    if not net.is_loopback and not net.is_link_local:
                        interfaces.append({
                            'ip': current_ip,
                            'cidr': str(net),
                            'adapter': current_adapter,
                            'gateway': current_gw,
                        })
                except Exception:
                    pass
            current_ip = current_mask = current_gw = None

        for line in output.splitlines():
            # 어댑터 섹션 헤더: 들여쓰기 없이 ':'로 끝나는 줄
            if line and not line[0].isspace() and line.strip().endswith(':'):
                _flush()
                header = line.strip().rstrip(':')
                # "이더넷 어댑터 이더넷" → "이더넷"
                # "Wireless LAN adapter Wi-Fi" → "Wi-Fi"  (대소문자 무관)
                header_lower = header.lower()
                for kw in ('어댑터 ', 'adapter '):
                    if kw in header_lower:
                        idx = header_lower.index(kw)
                        current_adapter = header[idx + len(kw):]
                        break
                else:
                    current_adapter = header
                continue

            ip_m = re.search(r'IPv4[^:]*:\s*([\d.]+)', line)
            if ip_m:
                current_ip = ip_m.group(1)
                continue

            # 서브넷 마스크: 255.로 시작하는 값
            mask_m = re.search(r':\s*(255\.[\d.]+)\s*$', line.strip())
            if mask_m and current_ip and not current_mask:
                current_mask = mask_m.group(1)
                continue

            # 기본 게이트웨이 (영문·한국어 공통)
            gw_m = re.search(r'(?:Default Gateway|기본 게이트웨이)[^:]*:\s*([\d.]+)', line)
            if gw_m:
                current_gw = gw_m.group(1)

        _flush()
        return interfaces
    except Exception:
        return []


@router.get("/interfaces", response_model=List[InterfaceInfo])
def get_interfaces():
    """이 서버가 속한 모든 로컬 서브넷과 게이트웨이 정보를 반환"""
    return _get_interfaces()


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
        return name.split('.')[0]
    except Exception:
        return ip


def _arp_table() -> dict:
    mac_map = {}
    try:
        r = subprocess.run(['arp', '-a'], capture_output=True, text=True, timeout=5)
        for line in r.stdout.splitlines():
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

    # {게이트웨이 IP: "어댑터명 기본 게이트웨이"} 맵 구성
    gateway_roles: dict = {}
    for iface in _get_interfaces():
        if iface.get('gateway'):
            adapter = iface.get('adapter', '')
            gateway_roles[iface['gateway']] = f"{adapter} 기본 게이트웨이" if adapter else "기본 게이트웨이"

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

    arp = _arp_table()
    existing_devices = db.query(Device).all()
    existing_ips = {d.ip_address for d in existing_devices}
    existing_hostnames = {d.hostname.lower() for d in existing_devices if d.hostname}

    results = []
    seen_hostnames: set = set()

    for ip in sorted(live, key=ipaddress.ip_address):
        hostname = _hostname(ip)
        hostname_key = hostname.lower()

        already = ip in existing_ips or (
            hostname_key != ip.lower() and hostname_key in existing_hostnames
        )

        if hostname_key != ip.lower() and hostname_key in seen_hostnames:
            continue
        seen_hostnames.add(hostname_key)

        results.append(ScanResult(
            ip_address=ip,
            hostname=hostname,
            mac_address=arp.get(ip),
            already_registered=already,
            role=gateway_roles.get(ip),
        ))

    return results

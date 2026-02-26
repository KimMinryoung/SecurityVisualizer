import json
import re
import subprocess
from typing import List, Optional

from fastapi import APIRouter, Depends
from sqlalchemy.orm import Session
from pydantic import BaseModel

from ..database import get_db
from ..models import Device, Network
from ..oui import lookup as oui_lookup

router = APIRouter(prefix="/api/scan/bluetooth", tags=["bluetooth"])


class BtScanResult(BaseModel):
    name: str
    mac_address: Optional[str] = None
    status: str  # "OK", "Disconnected", etc.
    vendor: Optional[str] = None
    already_registered: bool = False


class BtImportItem(BaseModel):
    name: str
    mac_address: Optional[str] = None
    device_type: str = "bt_other"  # bt_audio, bt_input, bt_other


class BtImportRequest(BaseModel):
    devices: List[BtImportItem]


def _extract_mac(instance_id: str) -> str | None:
    """InstanceId에서 BT MAC 주소 추출. 두 가지 형식 지원:
    1) BTHENUM\\DEV_AABBCCDDEEFF\\...
    2) BTHENUM\\{GUID}_VID&...\\7&xxx&0&AABBCCDDEEFF_C00000000
    """
    # 패턴 1: DEV_ 접두사 (대소문자 무시)
    m = re.search(r'DEV_([0-9A-Fa-f]{12})', instance_id, re.IGNORECASE)
    if m:
        raw = m.group(1).upper()
        return ':'.join(raw[i:i+2] for i in range(0, 12, 2))
    # 패턴 2: GUID 엔트리의 끝부분 &0&MAC_C
    m = re.search(r'&0&([0-9A-Fa-f]{12})_', instance_id)
    if m:
        raw = m.group(1).upper()
        return ':'.join(raw[i:i+2] for i in range(0, 12, 2))
    return None


def _scan_bluetooth() -> list:
    """
    PowerShell Get-PnpDevice로 블루투스 장치 목록 조회.
    InstanceId에서 MAC 주소를 추출하고, MAC 기준으로 중복 제거.
    """
    cmd = [
        'powershell', '-NoProfile', '-Command',
        (
            'Get-PnpDevice -Class Bluetooth -ErrorAction SilentlyContinue | '
            'Where-Object { $_.InstanceId -match "BTHENUM" } | '
            'Select-Object FriendlyName, Status, InstanceId, Class | '
            'ConvertTo-Json -Compress'
        )
    ]
    try:
        result = subprocess.run(cmd, capture_output=True, text=True, timeout=30)
        if result.returncode != 0 or not result.stdout.strip():
            return []

        data = json.loads(result.stdout)
        # PowerShell returns a single object (not array) when there's only 1 result
        if isinstance(data, dict):
            data = [data]

        # MAC별 가장 좋은 엔트리를 선택 (프로파일 중복 제거)
        seen_macs: dict[str, dict] = {}  # mac -> best entry
        no_mac_entries = []

        for item in data:
            name = item.get('FriendlyName', '').strip()
            instance_id = item.get('InstanceId', '')
            status = item.get('Status', '')

            if not name:
                continue

            mac = _extract_mac(instance_id)

            # BT 장치 유형 추정 (이름 기반 간이 분류)
            name_lower = name.lower()
            if any(kw in name_lower for kw in ('headphone', 'headset', 'earphone', 'buds', 'speaker', 'audio', 'airpods', 'soundbar')):
                bt_type = 'bt_audio'
            elif any(kw in name_lower for kw in ('mouse', 'keyboard', 'gamepad', 'controller', 'pen', 'stylus')):
                bt_type = 'bt_input'
            else:
                bt_type = 'bt_other'

            entry = {
                'name': name,
                'mac_address': mac,
                'status': status,
                'bt_type': bt_type,
            }

            if mac:
                prev = seen_macs.get(mac)
                if prev is None:
                    seen_macs[mac] = entry
                else:
                    # "Avrcp 전송" 등 프로파일 접미사 없는 이름 우선, OK 상태 우선
                    is_better = (
                        len(name) < len(prev['name']) or
                        (status == 'OK' and prev['status'] != 'OK')
                    )
                    if is_better:
                        seen_macs[mac] = entry
            else:
                no_mac_entries.append(entry)

        return list(seen_macs.values()) + no_mac_entries
    except Exception:
        return []


@router.get("/", response_model=List[BtScanResult])
def scan_bluetooth(db: Session = Depends(get_db)):
    """페어링된 블루투스 장치 목록 스캔"""
    raw = _scan_bluetooth()
    # import_bluetooth의 중복 체크와 동일하게 전체 devices MAC 확인
    all_devices = db.query(Device).filter(Device.mac_address.isnot(None)).all()
    existing_macs = {d.mac_address.upper() for d in all_devices if d.mac_address}

    results = []
    for dev in raw:
        mac = (dev.get('mac_address') or '').upper()
        results.append(BtScanResult(
            name=dev['name'],
            mac_address=dev.get('mac_address'),
            status=dev['status'],
            vendor=oui_lookup(mac) if mac else None,
            already_registered=mac in existing_macs if mac else False,
        ))
    return results


@router.post("/import")
def import_bluetooth(payload: BtImportRequest, db: Session = Depends(get_db)):
    """선택된 블루투스 장치를 DB에 등록"""
    # 가상 Bluetooth 네트워크 찾기/생성
    bt_net = db.query(Network).filter(Network.subnet == "bluetooth").first()
    if not bt_net:
        bt_net = Network(name="Bluetooth", subnet="bluetooth")
        db.add(bt_net)
        db.flush()

    imported = 0
    for dev in payload.devices:
        mac = (dev.mac_address or '').upper()
        ip_addr = f"bt:{mac}" if mac else f"bt:{dev.name}"

        # MAC 기반 중복 체크
        if mac:
            existing = db.query(Device).filter(
                Device.mac_address.ilike(mac)
            ).first()
            if existing:
                # 이름/상태 업데이트만
                existing.hostname = dev.name
                continue

        db.add(Device(
            hostname=dev.name,
            ip_address=ip_addr,
            mac_address=mac or None,
            device_type=dev.device_type,
            vendor=oui_lookup(mac) if mac else None,
            status='active',
            network_id=bt_net.id,
        ))
        imported += 1

    db.commit()
    return {"imported": imported}


@router.post("/refresh-status")
def refresh_bt_status(db: Session = Depends(get_db)):
    """등록된 BT 장비의 연결 상태를 PowerShell에서 실시간 조회하여 DB 갱신."""
    bt_devices = db.query(Device).filter(Device.ip_address.like('bt:%')).all()
    if not bt_devices:
        return {"updated": 0}

    # 현재 BT 연결 상태 조회 (MAC → status 맵)
    live = _scan_bluetooth()
    live_status: dict[str, str] = {}  # MAC(upper) → "OK" / "Error" / ...
    for entry in live:
        mac = (entry.get('mac_address') or '').upper()
        if mac:
            # MAC당 하나의 엔트리만 (dedup된 결과이므로)
            live_status[mac] = entry['status']

    updated = 0
    for dev in bt_devices:
        mac = (dev.mac_address or '').upper()
        if not mac:
            continue
        ps_status = live_status.get(mac)
        new_status = 'active' if ps_status == 'OK' else 'inactive'
        if dev.status != new_status:
            dev.status = new_status
            updated += 1

    db.commit()
    return {"updated": updated}

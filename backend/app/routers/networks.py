from fastapi import APIRouter, Depends, HTTPException
from sqlalchemy.orm import Session
from typing import List

from ..database import get_db
from ..models import Network, Device
from ..schemas import NetworkCreate, NetworkOut
from .scan import _get_interfaces

router = APIRouter(prefix="/api/networks", tags=["networks"])


def _classify_networks(networks: list, interfaces: list, devices: list = None) -> list:
    """
    네트워크 목록에 타입·상태·어댑터 정보 추가.
    - main: 주 네트워크 (Internet 연결됨, 게이트웨이 존재)
    - vmware: VMware 가상 네트워크
    - bluetooth: 블루투스 네트워크 (실제 연결됨)
    - scanned: 스캔 이력 (현재 연결되지 않음)
    """
    # 서브넷별 인터페이스 매핑
    iface_by_subnet = {}
    for iface in interfaces:
        cidr = iface.get("cidr", "")
        if cidr:
            iface_by_subnet[cidr] = iface

    # 네트워크별 연결된 장치 수 (Bluetooth 상태 판별용)
    device_count_by_net = {}
    if devices:
        for dev in devices:
            net_id = dev.network_id
            device_count_by_net[net_id] = device_count_by_net.get(net_id, 0) + 1

    result = []
    for net in networks:
        net_dict = {
            "id": net.id,
            "name": net.name,
            "subnet": net.subnet,
            "vlan_id": net.vlan_id,
            "gateway": net.gateway,
            "description": net.description,
        }

        iface = iface_by_subnet.get(net.subnet)

        # Bluetooth 네트워크 특별 처리
        if net.subnet == "bluetooth":
            net_dict["network_type"] = "bluetooth"
            # 연결된 장치가 있으면 active, 없으면 inactive
            net_dict["status"] = "active" if device_count_by_net.get(net.id, 0) > 0 else "inactive"
            net_dict["adapter"] = "Bluetooth"
        elif iface:
            # 현재 연결된 인터페이스
            adapter = iface.get("adapter", "")
            net_dict["adapter"] = adapter

            if "VMware" in adapter:
                net_dict["network_type"] = "vmware"
                net_dict["status"] = "virtual"
            elif iface.get("gateway"):
                # 게이트웨이가 있으면 주 네트워크
                net_dict["network_type"] = "main"
                net_dict["status"] = "active"
            else:
                net_dict["network_type"] = "scanned"
                net_dict["status"] = "active"
        else:
            # 인터페이스에 없음 — 스캔 이력
            net_dict["network_type"] = "scanned"
            net_dict["status"] = "inactive"
            net_dict["adapter"] = None

        result.append(net_dict)

    return result


@router.get("/", response_model=List[NetworkOut])
def list_networks(db: Session = Depends(get_db)):
    networks = db.query(Network).all()
    interfaces = _get_interfaces()
    devices = db.query(Device).all()
    return _classify_networks(networks, interfaces, devices)


@router.get("/{network_id}", response_model=NetworkOut)
def get_network(network_id: int, db: Session = Depends(get_db)):
    network = db.query(Network).filter(Network.id == network_id).first()
    if not network:
        raise HTTPException(status_code=404, detail="Network not found")
    interfaces = _get_interfaces()
    devices = db.query(Device).filter(Device.network_id == network_id).all()
    return _classify_networks([network], interfaces, devices)


@router.post("/", response_model=NetworkOut, status_code=201)
def create_network(payload: NetworkCreate, db: Session = Depends(get_db)):
    network = Network(**payload.model_dump())
    db.add(network)
    db.commit()
    db.refresh(network)
    return network


@router.put("/{network_id}", response_model=NetworkOut)
def update_network(network_id: int, payload: NetworkCreate, db: Session = Depends(get_db)):
    network = db.query(Network).filter(Network.id == network_id).first()
    if not network:
        raise HTTPException(status_code=404, detail="Network not found")
    for key, value in payload.model_dump().items():
        setattr(network, key, value)
    db.commit()
    db.refresh(network)
    return network


@router.delete("/{network_id}", status_code=204)
def delete_network(network_id: int, db: Session = Depends(get_db)):
    network = db.query(Network).filter(Network.id == network_id).first()
    if not network:
        raise HTTPException(status_code=404, detail="Network not found")
    db.delete(network)
    db.commit()

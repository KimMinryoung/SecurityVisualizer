from fastapi import APIRouter, Depends, HTTPException
from sqlalchemy.orm import Session, joinedload
from typing import List

from ..database import get_db
from ..models import Device, Network, DeviceSolution, SecuritySolution
from ..schemas import DeviceCreate, DeviceOut, DevicePatch
from ..oui import lookup as oui_lookup

router = APIRouter(prefix="/api/devices", tags=["devices"])


def _get_device(device_id: int, db: Session) -> Device:
    device = (
        db.query(Device)
        .options(joinedload(Device.device_solutions).joinedload(DeviceSolution.solution))
        .filter(Device.id == device_id)
        .first()
    )
    if not device:
        raise HTTPException(status_code=404, detail="Device not found")
    return device


@router.get("/", response_model=List[DeviceOut])
def list_devices(db: Session = Depends(get_db)):
    return (
        db.query(Device)
        .options(joinedload(Device.device_solutions).joinedload(DeviceSolution.solution))
        .all()
    )


@router.get("/{device_id}", response_model=DeviceOut)
def get_device(device_id: int, db: Session = Depends(get_db)):
    return _get_device(device_id, db)


@router.post("/", response_model=DeviceOut, status_code=201)
def create_device(payload: DeviceCreate, db: Session = Depends(get_db)):
    network = db.query(Network).filter(Network.id == payload.network_id).first()
    if not network:
        raise HTTPException(status_code=400, detail="Network not found")
    data = payload.model_dump()
    data["vendor"] = oui_lookup(data.get("mac_address") or "")
    device = Device(**data)
    db.add(device)
    db.commit()
    db.refresh(device)
    return _get_device(device.id, db)


@router.put("/{device_id}", response_model=DeviceOut)
def update_device(device_id: int, payload: DeviceCreate, db: Session = Depends(get_db)):
    device = _get_device(device_id, db)
    for key, value in payload.model_dump().items():
        setattr(device, key, value)
    db.commit()
    db.refresh(device)
    return _get_device(device_id, db)


@router.patch("/{device_id}", response_model=DeviceOut)
def patch_device(device_id: int, payload: DevicePatch, db: Session = Depends(get_db)):
    device = _get_device(device_id, db)
    for key, value in payload.model_dump(exclude_unset=True).items():
        setattr(device, key, value)
    # MAC이 새로 설정됐거나 기존에 있는데 vendor가 없으면 자동 계산
    if device.mac_address and not device.vendor:
        device.vendor = oui_lookup(device.mac_address) or None
    db.commit()
    return _get_device(device_id, db)


@router.delete("/{device_id}", status_code=204)
def delete_device(device_id: int, db: Session = Depends(get_db)):
    device = _get_device(device_id, db)
    db.delete(device)
    db.commit()

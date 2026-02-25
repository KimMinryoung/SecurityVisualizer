from fastapi import APIRouter, Depends, HTTPException
from sqlalchemy.orm import Session, joinedload
from typing import List

from ..database import get_db
from ..models import Device, Network, DeviceSolution, SecuritySolution
from ..schemas import DeviceCreate, DeviceOut

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
    device = Device(**payload.model_dump())
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


@router.delete("/{device_id}", status_code=204)
def delete_device(device_id: int, db: Session = Depends(get_db)):
    device = _get_device(device_id, db)
    db.delete(device)
    db.commit()

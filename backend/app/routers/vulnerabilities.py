from fastapi import APIRouter, Depends, HTTPException
from sqlalchemy.orm import Session

from ..database import get_db
from ..models import Device, DeviceVulnerability
from ..schemas import DeviceVulnerabilityCreate, DeviceVulnerabilityOut, DeviceVulnerabilityUpdate

router = APIRouter(prefix="/api/devices", tags=["vulnerabilities"])


def _get_device_or_404(device_id: int, db: Session) -> Device:
    dev = db.query(Device).filter(Device.id == device_id).first()
    if not dev:
        raise HTTPException(status_code=404, detail="Device not found")
    return dev


def _get_vuln_or_404(device_id: int, vid: int, db: Session) -> DeviceVulnerability:
    v = db.query(DeviceVulnerability).filter(
        DeviceVulnerability.id == vid,
        DeviceVulnerability.device_id == device_id,
    ).first()
    if not v:
        raise HTTPException(status_code=404, detail="Vulnerability not found")
    return v


@router.get("/{device_id}/vulnerabilities", response_model=list[DeviceVulnerabilityOut])
def list_vulnerabilities(device_id: int, db: Session = Depends(get_db)):
    _get_device_or_404(device_id, db)
    return db.query(DeviceVulnerability).filter(DeviceVulnerability.device_id == device_id).all()


@router.post("/{device_id}/vulnerabilities", response_model=DeviceVulnerabilityOut, status_code=201)
def create_vulnerability(device_id: int, body: DeviceVulnerabilityCreate, db: Session = Depends(get_db)):
    _get_device_or_404(device_id, db)
    vuln = DeviceVulnerability(device_id=device_id, **body.model_dump())
    db.add(vuln)
    db.commit()
    db.refresh(vuln)
    return vuln


@router.patch("/{device_id}/vulnerabilities/{vid}", response_model=DeviceVulnerabilityOut)
def update_vulnerability_status(device_id: int, vid: int, body: DeviceVulnerabilityUpdate, db: Session = Depends(get_db)):
    vuln = _get_vuln_or_404(device_id, vid, db)
    vuln.status = body.status
    db.commit()
    db.refresh(vuln)
    return vuln


@router.delete("/{device_id}/vulnerabilities/{vid}", status_code=204)
def delete_vulnerability(device_id: int, vid: int, db: Session = Depends(get_db)):
    vuln = _get_vuln_or_404(device_id, vid, db)
    db.delete(vuln)
    db.commit()

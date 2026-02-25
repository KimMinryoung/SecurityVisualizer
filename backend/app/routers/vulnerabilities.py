from fastapi import APIRouter, Depends, HTTPException
from sqlalchemy.orm import Session

from ..database import get_db
from ..models import Device, DeviceVulnerability
from ..schemas import DeviceVulnerabilityCreate, DeviceVulnerabilityOut, DeviceVulnerabilityUpdate
from ..vuln_rules import VULN_RULES

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


@router.post("/{device_id}/vulnerabilities/autoscan")
def autoscan_vulnerabilities(device_id: int, db: Session = Depends(get_db)):
    device = _get_device_or_404(device_id, db)
    os_lower = (device.os or "").lower()
    dtype = device.device_type or ""

    matched = []
    for rule in VULN_RULES:
        if not any(p in os_lower for p in rule["match"]):
            continue
        if rule["device_types"] and dtype not in rule["device_types"]:
            continue
        matched.extend(rule["vulns"])

    existing_cves = {
        v.cve_id
        for v in db.query(DeviceVulnerability).filter(DeviceVulnerability.device_id == device_id).all()
        if v.cve_id
    }

    added = 0
    skipped = 0
    for vuln in matched:
        if vuln["cve_id"] in existing_cves:
            skipped += 1
            continue
        db.add(DeviceVulnerability(
            device_id=device_id,
            cve_id=vuln["cve_id"],
            title=vuln["title"],
            severity=vuln["severity"],
            description=vuln["description"],
            status="open",
        ))
        existing_cves.add(vuln["cve_id"])
        added += 1

    db.commit()
    return {"added": added, "skipped": skipped, "matched_os": device.os or ""}


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

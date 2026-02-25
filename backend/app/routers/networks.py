from fastapi import APIRouter, Depends, HTTPException
from sqlalchemy.orm import Session
from typing import List

from ..database import get_db
from ..models import Network
from ..schemas import NetworkCreate, NetworkOut

router = APIRouter(prefix="/api/networks", tags=["networks"])


@router.get("/", response_model=List[NetworkOut])
def list_networks(db: Session = Depends(get_db)):
    return db.query(Network).all()


@router.get("/{network_id}", response_model=NetworkOut)
def get_network(network_id: int, db: Session = Depends(get_db)):
    network = db.query(Network).filter(Network.id == network_id).first()
    if not network:
        raise HTTPException(status_code=404, detail="Network not found")
    return network


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

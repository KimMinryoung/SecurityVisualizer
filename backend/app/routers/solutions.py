from fastapi import APIRouter, Depends, HTTPException
from sqlalchemy.orm import Session, joinedload
from typing import List

from ..database import get_db
from ..models import SecuritySolution, DeviceSolution, Device
from ..schemas import SecuritySolutionCreate, SecuritySolutionOut, DeviceSolutionCreate, DeviceSolutionOut

# Two separate routers, both imported in main.py
sol_router = APIRouter(prefix="/api/solutions", tags=["solutions"])
assign_router = APIRouter(prefix="/api/devices", tags=["solutions"])

# Re-export both as a list for main.py
router = sol_router  # primary export; assign_router imported explicitly


# --- Security Solution CRUD ---

@sol_router.get("/", response_model=List[SecuritySolutionOut])
def list_solutions(db: Session = Depends(get_db)):
    return db.query(SecuritySolution).all()


@sol_router.get("/{solution_id}", response_model=SecuritySolutionOut)
def get_solution(solution_id: int, db: Session = Depends(get_db)):
    sol = db.query(SecuritySolution).filter(SecuritySolution.id == solution_id).first()
    if not sol:
        raise HTTPException(status_code=404, detail="Solution not found")
    return sol


@sol_router.post("/", response_model=SecuritySolutionOut, status_code=201)
def create_solution(payload: SecuritySolutionCreate, db: Session = Depends(get_db)):
    sol = SecuritySolution(**payload.model_dump())
    db.add(sol)
    db.commit()
    db.refresh(sol)
    return sol


@sol_router.delete("/{solution_id}", status_code=204)
def delete_solution(solution_id: int, db: Session = Depends(get_db)):
    sol = db.query(SecuritySolution).filter(SecuritySolution.id == solution_id).first()
    if not sol:
        raise HTTPException(status_code=404, detail="Solution not found")
    db.delete(sol)
    db.commit()


# --- Device → Solution assignments ---

@assign_router.get("/{device_id}/solutions", response_model=List[DeviceSolutionOut])
def list_device_solutions(device_id: int, db: Session = Depends(get_db)):
    device = db.query(Device).filter(Device.id == device_id).first()
    if not device:
        raise HTTPException(status_code=404, detail="Device not found")
    return (
        db.query(DeviceSolution)
        .options(joinedload(DeviceSolution.solution))
        .filter(DeviceSolution.device_id == device_id)
        .all()
    )


@assign_router.post("/{device_id}/solutions", response_model=DeviceSolutionOut, status_code=201)
def assign_solution(device_id: int, payload: DeviceSolutionCreate, db: Session = Depends(get_db)):
    device = db.query(Device).filter(Device.id == device_id).first()
    if not device:
        raise HTTPException(status_code=404, detail="Device not found")
    sol = db.query(SecuritySolution).filter(SecuritySolution.id == payload.solution_id).first()
    if not sol:
        raise HTTPException(status_code=404, detail="Solution not found")
    ds = DeviceSolution(device_id=device_id, **payload.model_dump())
    db.add(ds)
    db.commit()
    db.refresh(ds)
    return db.query(DeviceSolution).options(joinedload(DeviceSolution.solution)).filter(DeviceSolution.id == ds.id).first()


@assign_router.delete("/{device_id}/solutions/{assignment_id}", status_code=204)
def unassign_solution(device_id: int, assignment_id: int, db: Session = Depends(get_db)):
    ds = db.query(DeviceSolution).filter(
        DeviceSolution.id == assignment_id,
        DeviceSolution.device_id == device_id
    ).first()
    if not ds:
        raise HTTPException(status_code=404, detail="Assignment not found")
    db.delete(ds)
    db.commit()

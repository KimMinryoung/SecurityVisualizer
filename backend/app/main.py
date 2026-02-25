from fastapi import FastAPI, Request
from fastapi.middleware.cors import CORSMiddleware

from .database import engine
from . import models
from .routers import networks, devices, topology, scan
from .routers.solutions import sol_router, assign_router

models.Base.metadata.create_all(bind=engine)

app = FastAPI(title="SecurityVisualizer API", version="1.0.0")

app.add_middleware(
    CORSMiddleware,
    allow_origins=["http://localhost:5173"],
    allow_credentials=True,
    allow_methods=["*"],
    allow_headers=["*"],
)

app.include_router(networks.router)
app.include_router(devices.router)
app.include_router(sol_router)
app.include_router(assign_router)
app.include_router(topology.router)
app.include_router(scan.router)


@app.get("/api/whoami")
def whoami(request: Request):
    """접속자의 IP 주소를 반환. 프록시 환경도 처리."""
    forwarded = request.headers.get("X-Forwarded-For")
    ip = forwarded.split(",")[0].strip() if forwarded else request.client.host
    return {"ip": ip}


@app.get("/")
def root():
    return {"status": "ok", "app": "SecurityVisualizer"}

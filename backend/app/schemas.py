from pydantic import BaseModel
from typing import Optional, List


# --- Device Vulnerability ---

class DeviceVulnerabilityCreate(BaseModel):
    cve_id: Optional[str] = None
    title: str
    severity: str = "medium"
    description: Optional[str] = None
    status: str = "open"


class DeviceVulnerabilityOut(BaseModel):
    id: int
    device_id: int
    cve_id: Optional[str]
    title: str
    severity: str
    description: Optional[str]
    status: str

    model_config = {"from_attributes": True}


class DeviceVulnerabilityUpdate(BaseModel):
    status: str  # "patched" or "ignored"


# --- Network ---

class NetworkCreate(BaseModel):
    name: str
    subnet: str
    vlan_id: Optional[int] = None
    gateway: Optional[str] = None
    description: Optional[str] = None


class NetworkOut(BaseModel):
    id: int
    name: str
    subnet: str
    vlan_id: Optional[int]
    gateway: Optional[str]
    description: Optional[str]

    model_config = {"from_attributes": True}


# --- Security Solution ---

class SecuritySolutionCreate(BaseModel):
    name: str
    type: str
    vendor: Optional[str] = None
    version: Optional[str] = None


class SecuritySolutionOut(BaseModel):
    id: int
    name: str
    type: str
    vendor: Optional[str]
    version: Optional[str]

    model_config = {"from_attributes": True}


# --- Device Solution (assignment) ---

class DeviceSolutionCreate(BaseModel):
    solution_id: int
    installed_version: Optional[str] = None
    status: Optional[str] = "active"


class DeviceSolutionOut(BaseModel):
    id: int
    device_id: int
    solution_id: int
    installed_version: Optional[str]
    status: str
    solution: SecuritySolutionOut

    model_config = {"from_attributes": True}


# --- Device ---

class DeviceCreate(BaseModel):
    hostname: str
    ip_address: str
    mac_address: Optional[str] = None
    os: Optional[str] = None
    device_type: Optional[str] = None
    status: Optional[str] = "active"
    network_id: int


class DeviceOut(BaseModel):
    id: int
    hostname: str
    ip_address: str
    mac_address: Optional[str]
    os: Optional[str]
    device_type: Optional[str]
    status: str
    network_id: int
    device_solutions: List[DeviceSolutionOut] = []

    model_config = {"from_attributes": True}


# --- Topology ---

class TopologyNode(BaseModel):
    id: str
    label: str
    type: str          # "device" | "network"
    parent: Optional[str] = None  # network id for grouping
    data: dict = {}


class TopologyEdge(BaseModel):
    id: str
    source: str
    target: str


class TopologyOut(BaseModel):
    nodes: List[TopologyNode]
    edges: List[TopologyEdge]

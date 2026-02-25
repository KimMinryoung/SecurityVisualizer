from fastapi import APIRouter, Depends
from sqlalchemy.orm import Session, joinedload

from ..database import get_db
from ..models import Network, Device, DeviceSolution, SecuritySolution, DeviceVulnerability
from ..schemas import TopologyOut, TopologyNode, TopologyEdge

router = APIRouter(prefix="/api/topology", tags=["topology"])


@router.get("/", response_model=TopologyOut)
def get_topology(db: Session = Depends(get_db)):
    networks = db.query(Network).all()
    devices = (
        db.query(Device)
        .options(
            joinedload(Device.device_solutions).joinedload(DeviceSolution.solution),
            joinedload(Device.device_vulnerabilities),
        )
        .all()
    )

    nodes: list[TopologyNode] = []
    edges: list[TopologyEdge] = []

    # Network nodes (parent/group nodes)
    for net in networks:
        nodes.append(TopologyNode(
            id=f"net-{net.id}",
            label=f"{net.name}\n{net.subnet}",
            type="network",
            data={
                "id": net.id,
                "name": net.name,
                "subnet": net.subnet,
                "gateway": net.gateway,
                "vlan_id": net.vlan_id,
                "description": net.description,
            }
        ))

    # Device nodes
    for dev in devices:
        solutions_data = [
            {"name": ds.solution.name, "type": ds.solution.type, "status": ds.status}
            for ds in dev.device_solutions if ds.solution
        ]
        vulns_data = [
            {"id": dv.id, "cve_id": dv.cve_id, "title": dv.title, "severity": dv.severity, "status": dv.status}
            for dv in dev.device_vulnerabilities
        ]
        nodes.append(TopologyNode(
            id=f"dev-{dev.id}",
            label=dev.hostname,
            type="device",
            parent=f"net-{dev.network_id}",
            data={
                "id": dev.id,
                "hostname": dev.hostname,
                "ip_address": dev.ip_address,
                "mac_address": dev.mac_address,
                "os": dev.os,
                "device_type": dev.device_type,
                "status": dev.status,
                "network_id": dev.network_id,
                "solutions": solutions_data,
                "vulnerabilities": vulns_data,
            }
        ))

        # Edge: device → network
        edges.append(TopologyEdge(
            id=f"e-dev{dev.id}-net{dev.network_id}",
            source=f"dev-{dev.id}",
            target=f"net-{dev.network_id}",
        ))

    return TopologyOut(nodes=nodes, edges=edges)

from fastapi import APIRouter, Depends
from sqlalchemy.orm import Session, joinedload

from ..database import get_db
from ..models import Network, Device, DeviceSolution, SecuritySolution
from ..schemas import TopologyOut, TopologyNode, TopologyEdge

router = APIRouter(prefix="/api/topology", tags=["topology"])


@router.get("/", response_model=TopologyOut)
def get_topology(db: Session = Depends(get_db)):
    networks = db.query(Network).all()
    devices = (
        db.query(Device)
        .options(joinedload(Device.device_solutions).joinedload(DeviceSolution.solution))
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
        solution_names = [ds.solution.name for ds in dev.device_solutions if ds.solution]
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
                "solutions": solution_names,
            }
        ))

        # Edge: device → network
        edges.append(TopologyEdge(
            id=f"e-dev{dev.id}-net{dev.network_id}",
            source=f"dev-{dev.id}",
            target=f"net-{dev.network_id}",
        ))

    return TopologyOut(nodes=nodes, edges=edges)

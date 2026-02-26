from fastapi import APIRouter, Depends, Request
from sqlalchemy.orm import Session, joinedload

from ..database import get_db
from ..models import Network, Device, DeviceSolution, SecuritySolution, DeviceVulnerability
from ..schemas import TopologyOut, TopologyNode, TopologyEdge, TopologyMeta
from .scan import _get_interfaces
from .networks import _classify_networks

router = APIRouter(prefix="/api/topology", tags=["topology"])


def _find_this_pc_device_id(db: Session) -> int | None:
    """
    로컬 인터페이스 IP/MAC 을 기반으로 DB 에서 이 PC 에 해당하는 device 를 찾는다.
    """
    ifaces = _get_interfaces()
    local_ips = {iface["ip"] for iface in ifaces}
    local_macs = {iface["mac"].upper() for iface in ifaces if iface.get("mac")}

    # IP 로 먼저 시도
    for dev in db.query(Device).filter(Device.ip_address.in_(local_ips)).all():
        return dev.id

    # MAC 으로 시도
    for dev in db.query(Device).filter(Device.mac_address.in_(local_macs)).all():
        return dev.id

    return None


@router.get("/", response_model=TopologyOut)
def get_topology(db: Session = Depends(get_db), request: Request = None):
    this_pc_id = _find_this_pc_device_id(db)
    networks = db.query(Network).all()
    interfaces = _get_interfaces()
    
    devices = (
        db.query(Device)
        .options(
            joinedload(Device.device_solutions).joinedload(DeviceSolution.solution),
            joinedload(Device.device_vulnerabilities),
        )
        .all()
    )
    
    # 네트워크 분류 (devices 정보 전달하여 Bluetooth 상태 정확히 판별)
    classified_networks = _classify_networks(networks, interfaces, devices)

    nodes: list[TopologyNode] = []
    edges: list[TopologyEdge] = []

    # Network nodes (parent/group nodes)
    for net in classified_networks:
        nodes.append(TopologyNode(
            id=f"net-{net['id']}",
            label=f"{net['name']}\n{net['subnet']}",
            type="network",
            data={
                "id": net["id"],
                "name": net["name"],
                "subnet": net["subnet"],
                "gateway": net["gateway"],
                "vlan_id": net["vlan_id"],
                "description": net["description"],
                "network_type": net["network_type"],
                "status": net["status"],
                "adapter": net["adapter"],
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

    return TopologyOut(nodes=nodes, edges=edges, meta=TopologyMeta(this_pc_device_id=this_pc_id))

"""Seed script — run once to populate sample data."""
import sys
import os
sys.path.insert(0, os.path.dirname(__file__))

from app.database import SessionLocal, engine
from app import models

models.Base.metadata.create_all(bind=engine)

db = SessionLocal()

# Clear existing data
db.query(models.DeviceSolution).delete()
db.query(models.Device).delete()
db.query(models.SecuritySolution).delete()
db.query(models.Network).delete()
db.commit()

# Networks
corp_lan = models.Network(name="Corporate LAN", subnet="192.168.1.0/24", gateway="192.168.1.1", vlan_id=10, description="Main office network")
dmz = models.Network(name="DMZ", subnet="10.0.0.0/24", gateway="10.0.0.1", vlan_id=20, description="Demilitarized zone")
mgmt = models.Network(name="Management", subnet="172.16.0.0/24", gateway="172.16.0.1", vlan_id=30, description="Network management VLAN")
db.add_all([corp_lan, dmz, mgmt])
db.commit()

# Security Solutions
av = models.SecuritySolution(name="CrowdStrike Falcon AV", type="antivirus", vendor="CrowdStrike", version="6.5")
edr = models.SecuritySolution(name="CrowdStrike Falcon EDR", type="EDR", vendor="CrowdStrike", version="6.5")
drm = models.SecuritySolution(name="Microsoft Purview DRM", type="DRM", vendor="Microsoft", version="2.1")
fw = models.SecuritySolution(name="Palo Alto NGFW", type="firewall", vendor="Palo Alto", version="10.2")
db.add_all([av, edr, drm, fw])
db.commit()

# Devices — Corporate LAN
ws1 = models.Device(hostname="WKSTN-001", ip_address="192.168.1.10", mac_address="AA:BB:CC:DD:EE:01", os="Windows 11", device_type="workstation", network_id=corp_lan.id)
ws2 = models.Device(hostname="WKSTN-002", ip_address="192.168.1.11", mac_address="AA:BB:CC:DD:EE:02", os="Windows 10", device_type="workstation", network_id=corp_lan.id)
ws3 = models.Device(hostname="WKSTN-003", ip_address="192.168.1.12", mac_address="AA:BB:CC:DD:EE:03", os="Ubuntu 22.04", device_type="workstation", network_id=corp_lan.id)
srv1 = models.Device(hostname="FILE-SRV-01", ip_address="192.168.1.50", mac_address="AA:BB:CC:DD:EE:10", os="Windows Server 2022", device_type="server", network_id=corp_lan.id)

# Devices — DMZ
web = models.Device(hostname="WEB-01", ip_address="10.0.0.10", mac_address="BB:CC:DD:EE:FF:01", os="Ubuntu 22.04", device_type="server", network_id=dmz.id)
mail = models.Device(hostname="MAIL-01", ip_address="10.0.0.11", mac_address="BB:CC:DD:EE:FF:02", os="Ubuntu 20.04", device_type="server", network_id=dmz.id)

# Devices — Management
mgmt_dev = models.Device(hostname="MGMT-SW-01", ip_address="172.16.0.10", mac_address="CC:DD:EE:FF:00:01", os="Cisco IOS", device_type="router", network_id=mgmt.id)

db.add_all([ws1, ws2, ws3, srv1, web, mail, mgmt_dev])
db.commit()

# Assign solutions
# ws1: fully protected
db.add(models.DeviceSolution(device_id=ws1.id, solution_id=av.id, installed_version="6.5", status="active"))
db.add(models.DeviceSolution(device_id=ws1.id, solution_id=edr.id, installed_version="6.5", status="active"))
db.add(models.DeviceSolution(device_id=ws1.id, solution_id=drm.id, installed_version="2.1", status="active"))

# ws2: missing EDR
db.add(models.DeviceSolution(device_id=ws2.id, solution_id=av.id, installed_version="6.4", status="outdated"))

# ws3: no solutions (gap)

# srv1: AV + EDR
db.add(models.DeviceSolution(device_id=srv1.id, solution_id=av.id, installed_version="6.5", status="active"))
db.add(models.DeviceSolution(device_id=srv1.id, solution_id=edr.id, installed_version="6.5", status="active"))

# web: AV only
db.add(models.DeviceSolution(device_id=web.id, solution_id=av.id, installed_version="6.5", status="active"))

# mail: nothing
# mgmt_dev: nothing

db.commit()
db.close()

print("Seed complete.")
print(f"  Networks: 3 (Corporate LAN, DMZ, Management)")
print(f"  Devices:  7")
print(f"  Solutions: 4")
print(f"  Assignments: 6")

from sqlalchemy import Column, Integer, String, ForeignKey, Enum, UniqueConstraint
from sqlalchemy.orm import relationship
from .database import Base


class Network(Base):
    __tablename__ = "networks"

    id = Column(Integer, primary_key=True, index=True)
    name = Column(String, nullable=False)
    subnet = Column(String, nullable=False, index=True)  # CIDR notation
    vlan_id = Column(Integer, nullable=True)
    gateway = Column(String, nullable=True)
    description = Column(String, nullable=True)

    __table_args__ = (
        UniqueConstraint('subnet', name='uq_networks_subnet'),
    )

    devices = relationship("Device", back_populates="network")


class Device(Base):
    __tablename__ = "devices"

    id = Column(Integer, primary_key=True, index=True)
    hostname = Column(String, nullable=False)
    ip_address = Column(String, nullable=False)
    mac_address = Column(String, nullable=True)
    vendor = Column(String, nullable=True)       # MAC OUI 기반 제조사
    os = Column(String, nullable=True)
    device_type = Column(String, nullable=True)  # server, workstation, router, etc.
    status = Column(String, default="active")  # active, inactive, unknown
    network_id = Column(Integer, ForeignKey("networks.id"), nullable=False)

    network = relationship("Network", back_populates="devices")
    device_solutions = relationship("DeviceSolution", back_populates="device", cascade="all, delete-orphan")
    device_vulnerabilities = relationship("DeviceVulnerability", back_populates="device", cascade="all, delete-orphan")


class SecuritySolution(Base):
    __tablename__ = "security_solutions"

    id = Column(Integer, primary_key=True, index=True)
    name = Column(String, nullable=False)
    type = Column(String, nullable=False)  # antivirus, EDR, DRM, firewall, other
    vendor = Column(String, nullable=True)
    version = Column(String, nullable=True)

    device_solutions = relationship("DeviceSolution", back_populates="solution")


class DeviceVulnerability(Base):
    __tablename__ = "device_vulnerabilities"

    id          = Column(Integer, primary_key=True, index=True)
    device_id   = Column(Integer, ForeignKey("devices.id"), nullable=False)
    cve_id      = Column(String, nullable=True)   # "CVE-2024-1234" (optional)
    title       = Column(String, nullable=False)
    severity    = Column(String, default="medium")  # critical/high/medium/low
    description = Column(String, nullable=True)
    status      = Column(String, default="open")    # open/patched/ignored

    device = relationship("Device", back_populates="device_vulnerabilities")


class DeviceSolution(Base):
    __tablename__ = "device_solutions"

    id = Column(Integer, primary_key=True, index=True)
    device_id = Column(Integer, ForeignKey("devices.id"), nullable=False)
    solution_id = Column(Integer, ForeignKey("security_solutions.id"), nullable=False)
    installed_version = Column(String, nullable=True)
    status = Column(String, default="active")  # active, inactive, outdated

    device = relationship("Device", back_populates="device_solutions")
    solution = relationship("SecuritySolution", back_populates="device_solutions")

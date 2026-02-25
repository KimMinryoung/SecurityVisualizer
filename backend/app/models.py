from sqlalchemy import Column, Integer, String, ForeignKey, Enum
from sqlalchemy.orm import relationship
from .database import Base


class Network(Base):
    __tablename__ = "networks"

    id = Column(Integer, primary_key=True, index=True)
    name = Column(String, nullable=False)
    subnet = Column(String, nullable=False)  # CIDR notation
    vlan_id = Column(Integer, nullable=True)
    gateway = Column(String, nullable=True)
    description = Column(String, nullable=True)

    devices = relationship("Device", back_populates="network")


class Device(Base):
    __tablename__ = "devices"

    id = Column(Integer, primary_key=True, index=True)
    hostname = Column(String, nullable=False)
    ip_address = Column(String, nullable=False)
    mac_address = Column(String, nullable=True)
    os = Column(String, nullable=True)
    device_type = Column(String, nullable=True)  # server, workstation, router, etc.
    status = Column(String, default="active")  # active, inactive, unknown
    network_id = Column(Integer, ForeignKey("networks.id"), nullable=False)

    network = relationship("Network", back_populates="devices")
    device_solutions = relationship("DeviceSolution", back_populates="device", cascade="all, delete-orphan")


class SecuritySolution(Base):
    __tablename__ = "security_solutions"

    id = Column(Integer, primary_key=True, index=True)
    name = Column(String, nullable=False)
    type = Column(String, nullable=False)  # antivirus, EDR, DRM, firewall, other
    vendor = Column(String, nullable=True)
    version = Column(String, nullable=True)

    device_solutions = relationship("DeviceSolution", back_populates="solution")


class DeviceSolution(Base):
    __tablename__ = "device_solutions"

    id = Column(Integer, primary_key=True, index=True)
    device_id = Column(Integer, ForeignKey("devices.id"), nullable=False)
    solution_id = Column(Integer, ForeignKey("security_solutions.id"), nullable=False)
    installed_version = Column(String, nullable=True)
    status = Column(String, default="active")  # active, inactive, outdated

    device = relationship("Device", back_populates="device_solutions")
    solution = relationship("SecuritySolution", back_populates="device_solutions")

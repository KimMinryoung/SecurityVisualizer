import { useState, useEffect, useCallback } from 'react'
import { api } from './api/client.js'
import NetworkGraph from './components/NetworkGraph.jsx'
import DevicePanel from './components/DevicePanel.jsx'
import Toolbar from './components/Toolbar.jsx'

export default function App() {
  const [topology, setTopology] = useState(null)
  const [networks, setNetworks] = useState([])
  const [selectedNode, setSelectedNode] = useState(null)
  const [error, setError] = useState('')
  // topology.meta.this_pc_device_id 우선, 없으면 localStorage 폴백
  const [myDeviceId, setMyDeviceId] = useState(() => localStorage.getItem('myDeviceId'))
  // {ip: "Wi-Fi 기본 게이트웨이"} — 인터페이스 정보로부터 도출
  const [gatewayRoles, setGatewayRoles] = useState({})
  const [activeCidrs, setActiveCidrs] = useState([])
  const [coverageMode, setCoverageMode] = useState(false)
  const [filterTypes, setFilterTypes] = useState(new Set())
  const [vulnMode, setVulnMode] = useState(false)
  const [vulnSeverityFilter, setVulnSeverityFilter] = useState(new Set())

  function handleSetMyDevice(id) {
    const sid = String(id)
    localStorage.setItem('myDeviceId', sid)
    setMyDeviceId(sid)
  }

  const loadData = useCallback(async () => {
    try {
      // BT 장비 status 를 현재 연결 상태로 갱신한 뒤 topology 조회
      await api.refreshBtStatus().catch(() => {})
      const [topo, nets] = await Promise.all([api.getTopology(), api.listNetworks()])
      setTopology(topo)
      setNetworks(nets)
      // topology.meta.this_pc_device_id 가 있으면 우선 사용
      if (topo.meta?.this_pc_device_id) {
        handleSetMyDevice(topo.meta.this_pc_device_id)
      }
      setError('')
    } catch (e) {
      setError(`Failed to connect to backend: ${e.message}`)
    }
  }, [])

  useEffect(() => { loadData() }, [loadData])

  // 게이트웨이 역할 맵 구성 — {ip: "어댑터명 기본 게이트웨이"}
  useEffect(() => {
    api.getInterfaces()
      .then(ifaces => {
        const roles = {}
        const cidrs = []
        for (const iface of ifaces) {
          if (iface.gateway) {
            const name = iface.adapter ? `${iface.adapter} 기본 게이트웨이` : '기본 게이트웨이'
            roles[iface.gateway] = name
          }
          if (iface.cidr) cidrs.push(iface.cidr)
        }
        setGatewayRoles(roles)
        setActiveCidrs(cidrs)
      })
      .catch(() => {})
  }, [])

  // topology 로드 후 접속자 IP/MAC 으로 내 PC 자동 감지 + OS 자동 채움
  // (topology.meta.this_pc_device_id 가 없으면 폴백으로 사용)
  useEffect(() => {
    if (!topology || topology.meta?.this_pc_device_id) return
    api.whoami()
      .then(({ ip, local_ips = [], local_macs = {}, os }) => {
        // HTTP 클라이언트 IP(127.0.0.1 등) 와 실제 인터페이스 IP 모두 시도
        const candidates = new Set([ip, ...local_ips])
        const localMacSet = new Set(
          Object.values(local_macs).map(m => m.toUpperCase())
        )
        // IP 매칭 → MAC 매칭 순서로 내 PC 탐색
        const match = topology.nodes.find(
          n => n.type === 'device' && candidates.has(n.data?.ip_address)
        ) || topology.nodes.find(
          n => n.type === 'device' && n.data?.mac_address && localMacSet.has(n.data.mac_address.toUpperCase())
        )
        if (!match) return
        handleSetMyDevice(match.data.id)
        // OS·MAC 미입력 장비에 로컬 정보 자동 기입 (backend 가 vendor 자동 계산)
        const patch = {}
        if (!match.data.os && os) patch.os = os
        if (!match.data.mac_address && local_macs[match.data.ip_address]) {
          patch.mac_address = local_macs[match.data.ip_address]
        }
        if (Object.keys(patch).length > 0) {
          api.patchDevice(match.data.id, patch).then(loadData).catch(() => {})
        }
      })
      .catch(() => {})
  }, [topology])

  return (
    <div style={{ height: '100vh', display: 'flex', flexDirection: 'column', overflow: 'hidden' }}>
      <Toolbar
        networks={networks}
        onRefresh={loadData}
        coverageMode={coverageMode}
        setCoverageMode={setCoverageMode}
        filterTypes={filterTypes}
        setFilterTypes={setFilterTypes}
        topology={topology}
        vulnMode={vulnMode}
        setVulnMode={setVulnMode}
        vulnSeverityFilter={vulnSeverityFilter}
        setVulnSeverityFilter={setVulnSeverityFilter}
      />

      {error && (
        <div style={{
          background: '#c53030', color: '#fff', padding: '10px 16px',
          fontSize: '13px', flexShrink: 0,
        }}>
          {error}
        </div>
      )}

      <div style={{ flex: 1, display: 'flex', overflow: 'hidden' }}>
        <NetworkGraph
          topology={topology}
          myDeviceId={myDeviceId}
          gatewayRoles={gatewayRoles}
          activeCidrs={activeCidrs}
          onNodeClick={setSelectedNode}
          coverageMode={coverageMode}
          filterTypes={filterTypes}
          vulnMode={vulnMode}
          vulnSeverityFilter={vulnSeverityFilter}
        />
        <DevicePanel
          selectedNode={selectedNode}
          myDeviceId={myDeviceId}
          gatewayRoles={gatewayRoles}
          onSetMyDevice={handleSetMyDevice}
          onDeselect={() => setSelectedNode(null)}
          onRefresh={loadData}
        />
      </div>
    </div>
  )
}

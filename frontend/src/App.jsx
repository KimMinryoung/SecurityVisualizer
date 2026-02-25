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
  const [myDeviceId, setMyDeviceId] = useState(() => localStorage.getItem('myDeviceId'))
  // {ip: "Wi-Fi 기본 게이트웨이"} — 인터페이스 정보로부터 도출
  const [gatewayRoles, setGatewayRoles] = useState({})
  const [coverageMode, setCoverageMode] = useState(false)
  const [filterTypes, setFilterTypes] = useState(new Set())

  function handleSetMyDevice(id) {
    const sid = String(id)
    localStorage.setItem('myDeviceId', sid)
    setMyDeviceId(sid)
  }

  const loadData = useCallback(async () => {
    try {
      const [topo, nets] = await Promise.all([api.getTopology(), api.listNetworks()])
      setTopology(topo)
      setNetworks(nets)
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
        for (const iface of ifaces) {
          if (iface.gateway) {
            const name = iface.adapter ? `${iface.adapter} 기본 게이트웨이` : '기본 게이트웨이'
            roles[iface.gateway] = name
          }
        }
        setGatewayRoles(roles)
      })
      .catch(() => {})
  }, [])

  // topology 로드 후 접속자 IP로 내 PC 자동 감지
  useEffect(() => {
    if (!topology) return
    api.whoami()
      .then(({ ip }) => {
        const match = topology.nodes.find(
          n => n.type === 'device' && n.data?.ip_address === ip
        )
        if (match) handleSetMyDevice(match.data.id)
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
          onNodeClick={setSelectedNode}
          coverageMode={coverageMode}
          filterTypes={filterTypes}
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

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
  // 자동 감지 실패 시 localStorage 수동 설정을 폴백으로 사용
  const [myDeviceId, setMyDeviceId] = useState(() => localStorage.getItem('myDeviceId'))

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

  // topology 로드 후 접속자 IP로 내 PC 자동 감지
  useEffect(() => {
    if (!topology) return
    api.whoami()
      .then(({ ip }) => {
        const match = topology.nodes.find(
          n => n.type === 'device' && n.data?.ip_address === ip
        )
        if (match) {
          // 자동 감지 성공 — localStorage에도 저장해 새로고침 후 유지
          handleSetMyDevice(match.data.id)
        }
        // 감지 실패(127.0.0.1 등)면 기존 localStorage 값 유지
      })
      .catch(() => {/* 무시 — 수동 선택 폴백 유지 */})
  }, [topology])

  return (
    <div style={{ height: '100vh', display: 'flex', flexDirection: 'column', overflow: 'hidden' }}>
      <Toolbar networks={networks} onRefresh={loadData} />

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
          onNodeClick={setSelectedNode}
        />
        <DevicePanel
          selectedNode={selectedNode}
          myDeviceId={myDeviceId}
          onSetMyDevice={handleSetMyDevice}
          onDeselect={() => setSelectedNode(null)}
          onRefresh={loadData}
        />
      </div>
    </div>
  )
}

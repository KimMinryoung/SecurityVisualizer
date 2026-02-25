import { useState } from 'react'
import { api } from '../api/client.js'

const S = {
  overlay: {
    position: 'fixed', inset: 0, background: 'rgba(0,0,0,0.65)',
    display: 'flex', alignItems: 'center', justifyContent: 'center', zIndex: 200,
  },
  modal: {
    background: '#1a1d27', border: '1px solid #2d3148', borderRadius: 12,
    padding: 24, width: 560, maxWidth: '95vw', maxHeight: '85vh',
    display: 'flex', flexDirection: 'column', gap: 16,
  },
  label: { fontSize: 11, color: '#64748b', textTransform: 'uppercase', letterSpacing: '0.06em', marginBottom: 4 },
  input: {
    width: '100%', padding: '9px 12px', background: '#0f1117',
    border: '1px solid #2d3148', borderRadius: 7, color: '#e2e8f0', fontSize: 14,
  },
  btn: { padding: '9px 18px', borderRadius: 7, border: 'none', cursor: 'pointer', fontWeight: 600, fontSize: 13 },
  row: {
    display: 'flex', alignItems: 'center', gap: 10,
    padding: '8px 10px', borderRadius: 7, marginBottom: 3,
  },
  badge: { fontSize: 11, padding: '2px 8px', borderRadius: 10, fontWeight: 600 },
  scrollBox: { overflowY: 'auto', maxHeight: 260, flex: 1 },
}

// phase: 'idle' | 'loading' | 'done' | 'error'

export default function RouterImportDialog({ networks, topology, onImport, onClose }) {
  const [phase, setPhase] = useState('idle')
  const [password, setPassword] = useState('')
  const [routerUrl, setRouterUrl] = useState('http://192.168.0.1')
  const [clients, setClients] = useState([])
  const [selected, setSelected] = useState(new Set())
  const [networkId, setNetworkId] = useState(networks[0]?.id ?? '__new__')
  const [newNetworkName, setNewNetworkName] = useState('')
  const [deviceType, setDeviceType] = useState('workstation')
  const [error, setError] = useState('')
  const [importing, setImporting] = useState(false)

  // 이미 등록된 IP 집합
  const registeredIps = new Set(
    (topology?.nodes || [])
      .filter(n => n.type === 'device')
      .map(n => n.data?.ip_address)
      .filter(Boolean)
  )

  async function handleFetch() {
    if (!password.trim()) { setError('공유기 관리 비밀번호를 입력하세요'); return }
    setPhase('loading')
    setError('')
    setClients([])
    try {
      const data = await api.fetchRouterClients(password, routerUrl)
      setClients(data)
      const newOnes = data.filter(c => !registeredIps.has(c.ip_address))
      setSelected(new Set(newOnes.map(c => c.ip_address)))
      setPhase('done')
    } catch (e) {
      setError(e.message)
      setPhase('error')
    }
  }

  async function handleImport() {
    const toImport = clients.filter(c => selected.has(c.ip_address) && !registeredIps.has(c.ip_address))
    if (toImport.length === 0) { setError('가져올 신규 장비를 선택하세요'); return }

    setImporting(true)
    setError('')
    try {
      let targetNetworkId = networkId
      if (networkId === '__new__') {
        const name = newNetworkName.trim() || `${routerUrl} 네트워크`
        const net = await api.createNetwork({ name, subnet: '192.168.0.0/24' })
        targetNetworkId = net.id
      }
      for (const c of toImport) {
        await api.createDevice({
          hostname: c.hostname || c.ip_address,
          ip_address: c.ip_address,
          mac_address: c.mac_address ?? undefined,
          device_type: deviceType,
          network_id: parseInt(targetNetworkId),
          status: 'active',
        })
      }
      onImport()
      onClose()
    } catch (e) {
      setError(e.message)
    } finally {
      setImporting(false)
    }
  }

  function toggle(ip) {
    setSelected(prev => {
      const next = new Set(prev)
      next.has(ip) ? next.delete(ip) : next.add(ip)
      return next
    })
  }

  const newCount = clients.filter(c => !registeredIps.has(c.ip_address)).length
  const selectedNewCount = clients.filter(c => selected.has(c.ip_address) && !registeredIps.has(c.ip_address)).length

  return (
    <div style={S.overlay} onClick={e => e.target === e.currentTarget && onClose()}>
      <div style={S.modal}>

        {/* 헤더 */}
        <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
          <span style={{ fontSize: 16, fontWeight: 700, color: '#e2e8f0' }}>📡 공유기 클라이언트 가져오기</span>
          <button onClick={onClose} style={{ background: 'none', border: 'none', color: '#718096', cursor: 'pointer', fontSize: 20 }}>×</button>
        </div>

        {/* 입력 폼 */}
        {(phase === 'idle' || phase === 'error') && (
          <div style={{ display: 'flex', flexDirection: 'column', gap: 10 }}>
            <div>
              <div style={S.label}>공유기 주소</div>
              <input
                style={S.input}
                value={routerUrl}
                onChange={e => setRouterUrl(e.target.value)}
                placeholder="http://192.168.0.1"
              />
            </div>
            <div>
              <div style={S.label}>관리자 비밀번호</div>
              <input
                style={S.input}
                type="password"
                value={password}
                onChange={e => setPassword(e.target.value)}
                placeholder="공유기 관리 페이지 비밀번호"
                onKeyDown={e => e.key === 'Enter' && handleFetch()}
                autoFocus
              />
            </div>
            {error && (
              <div style={{ color: '#fc8181', fontSize: 13, whiteSpace: 'pre-wrap' }}>{error}</div>
            )}
            <button
              style={{ ...S.btn, background: '#0c4a6e', color: '#7dd3fc', alignSelf: 'flex-end' }}
              onClick={handleFetch}
            >
              클라이언트 가져오기
            </button>
          </div>
        )}

        {/* 로딩 */}
        {phase === 'loading' && (
          <div style={{ textAlign: 'center', padding: '32px 0', color: '#64748b' }}>
            <div style={{ fontSize: 36, marginBottom: 12 }}>📡</div>
            <div style={{ fontSize: 14, color: '#94a3b8' }}>공유기에 연결 중…</div>
            <div style={{ fontSize: 12, color: '#4a5568', marginTop: 6 }}>
              Playwright 브라우저로 {routerUrl} 로그인 중입니다.
            </div>
            <div style={{ fontSize: 11, color: '#374151', marginTop: 4 }}>
              30초 정도 걸릴 수 있습니다
            </div>
          </div>
        )}

        {/* 결과 */}
        {phase === 'done' && (
          <>
            {/* 통계 */}
            <div style={{ display: 'flex', gap: 10 }}>
              <Stat label="발견" value={clients.length} color="#94a3b8" />
              <Stat label="신규" value={newCount} color="#4ade80" />
              <Stat label="등록됨" value={clients.length - newCount} color="#4a5568" />
              <button
                onClick={() => setPhase('idle')}
                style={{ ...S.btn, background: '#2d3148', color: '#94a3b8', padding: '4px 12px', fontSize: 12 }}
              >
                ↺ 다시 가져오기
              </button>
            </div>

            {/* 클라이언트 목록 */}
            <div style={S.scrollBox}>
              {clients.length === 0 ? (
                <div style={{ color: '#4a5568', fontSize: 13, textAlign: 'center', padding: '20px 0' }}>
                  클라이언트를 찾지 못했습니다
                </div>
              ) : clients.map(c => {
                const isNew = !registeredIps.has(c.ip_address)
                const isSel = selected.has(c.ip_address)
                return (
                  <div
                    key={c.ip_address}
                    onClick={() => isNew && toggle(c.ip_address)}
                    style={{
                      ...S.row,
                      background: isSel && isNew ? '#1e2a1e' : '#0f1117',
                      border: `1px solid ${isSel && isNew ? '#2d5a2d' : '#1e2235'}`,
                      opacity: isNew ? 1 : 0.45,
                      cursor: isNew ? 'pointer' : 'default',
                    }}
                  >
                    <input
                      type="checkbox" checked={isSel && isNew} disabled={!isNew}
                      onChange={() => toggle(c.ip_address)}
                      onClick={e => e.stopPropagation()}
                    />
                    <span style={{ fontFamily: 'monospace', fontSize: 13, color: '#94a3b8', minWidth: 120 }}>
                      {c.ip_address}
                    </span>
                    <div style={{ flex: 1 }}>
                      <div style={{ fontSize: 13, color: '#e2e8f0' }}>
                        {c.hostname || '—'}
                      </div>
                      {c.mac_address && (
                        <div style={{ fontSize: 11, color: '#4a5568', marginTop: 2, fontFamily: 'monospace' }}>
                          {c.mac_address}
                        </div>
                      )}
                    </div>
                    <span style={{
                      ...S.badge,
                      background: isNew ? '#14532d' : '#1e2235',
                      color: isNew ? '#4ade80' : '#4a5568',
                    }}>
                      {isNew ? '신규' : '등록됨'}
                    </span>
                  </div>
                )
              })}
            </div>

            {/* 가져오기 */}
            {newCount > 0 && (
              <div style={{ borderTop: '1px solid #2d3148', paddingTop: 14, display: 'flex', gap: 10, alignItems: 'flex-end', flexWrap: 'wrap' }}>
                <div style={{ flex: 1, minWidth: 150 }}>
                  <div style={S.label}>네트워크 배정</div>
                  <select style={{ ...S.input, fontFamily: 'inherit' }} value={networkId} onChange={e => setNetworkId(e.target.value)}>
                    <option value="__new__">+ 새 네트워크 만들기</option>
                    {networks.map(n => <option key={n.id} value={n.id}>{n.name} ({n.subnet})</option>)}
                  </select>
                  {networkId === '__new__' && (
                    <input
                      style={{ ...S.input, marginTop: 6, fontFamily: 'inherit' }}
                      placeholder="네트워크 이름"
                      value={newNetworkName}
                      onChange={e => setNewNetworkName(e.target.value)}
                    />
                  )}
                </div>
                <div style={{ flex: 1, minWidth: 120 }}>
                  <div style={S.label}>장비 유형</div>
                  <select style={{ ...S.input, fontFamily: 'inherit' }} value={deviceType} onChange={e => setDeviceType(e.target.value)}>
                    {['workstation', 'server', 'router', 'switch', 'firewall', 'other'].map(t => (
                      <option key={t} value={t}>{t}</option>
                    ))}
                  </select>
                </div>
                <button
                  style={{ ...S.btn, background: selectedNewCount ? '#2d9e6b' : '#2d3148', color: '#fff' }}
                  onClick={handleImport}
                  disabled={!selectedNewCount || importing}
                >
                  {importing ? '가져오는 중…' : `${selectedNewCount}개 가져오기`}
                </button>
              </div>
            )}

            {error && <div style={{ color: '#fc8181', fontSize: 13 }}>{error}</div>}
          </>
        )}
      </div>
    </div>
  )
}

function Stat({ label, value, color }) {
  return (
    <div style={{ background: '#0f1117', border: '1px solid #1e2235', borderRadius: 8, padding: '8px 14px', textAlign: 'center', flex: 1 }}>
      <div style={{ fontSize: 20, fontWeight: 700, color }}>{value}</div>
      <div style={{ fontSize: 11, color: '#4a5568' }}>{label}</div>
    </div>
  )
}

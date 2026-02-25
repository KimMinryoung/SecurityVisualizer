import { useState, useEffect } from 'react'
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
  header: { display: 'flex', justifyContent: 'space-between', alignItems: 'center' },
  title: { fontSize: 16, fontWeight: 700, color: '#e2e8f0' },
  closeBtn: { background: 'none', border: 'none', color: '#718096', cursor: 'pointer', fontSize: 20 },
  label: { fontSize: 11, color: '#64748b', textTransform: 'uppercase', letterSpacing: '0.06em', marginBottom: 4 },
  input: {
    width: '100%', padding: '9px 12px', background: '#0f1117',
    border: '1px solid #2d3148', borderRadius: 7, color: '#e2e8f0',
    fontSize: 14, fontFamily: 'monospace',
  },
  btn: { padding: '9px 18px', borderRadius: 7, border: 'none', cursor: 'pointer', fontWeight: 600, fontSize: 13 },
  row: {
    display: 'flex', alignItems: 'center', gap: 10,
    padding: '8px 10px', borderRadius: 7, marginBottom: 3,
  },
  scrollBox: { overflowY: 'auto', maxHeight: 280, flex: 1 },
  badge: { fontSize: 11, padding: '2px 8px', borderRadius: 10, fontWeight: 600 },
}

export default function ScanDialog({ networks, onImport, onClose }) {
  const [cidr, setCidr] = useState('')
  const [scanning, setScanning] = useState(false)
  const [results, setResults] = useState(null)      // null = 아직 스캔 안 함
  const [selected, setSelected] = useState(new Set())
  const [networkId, setNetworkId] = useState(networks[0]?.id ?? '__new__')
  const [newNetworkName, setNewNetworkName] = useState('')
  const [deviceType, setDeviceType] = useState('workstation')
  const [error, setError] = useState('')
  const [importing, setImporting] = useState(false)

  // 접속자 IP로 CIDR 자동 추천
  useEffect(() => {
    api.whoami()
      .then(({ ip }) => {
        if (!ip || ip.startsWith('127.')) return
        const parts = ip.split('.')
        setCidr(`${parts[0]}.${parts[1]}.${parts[2]}.0/24`)
      })
      .catch(() => {})
  }, [])

  async function handleScan() {
    if (!cidr.trim()) { setError('CIDR을 입력하세요'); return }
    setError('')
    setScanning(true)
    setResults(null)
    try {
      const data = await api.scanNetwork(cidr.trim())
      setResults(data)
      // 신규 장비 자동 선택
      setSelected(new Set(data.filter(r => !r.already_registered).map(r => r.ip_address)))
    } catch (e) {
      setError(e.message)
    } finally {
      setScanning(false)
    }
  }

  async function handleImport() {
    const toImport = results.filter(r => selected.has(r.ip_address) && !r.already_registered)
    if (toImport.length === 0) { setError('가져올 신규 장비를 선택하세요'); return }

    setImporting(true)
    setError('')
    try {
      let targetNetworkId = networkId

      // 새 네트워크 생성 선택 시
      if (networkId === '__new__') {
        const name = newNetworkName.trim() || cidr
        const net = await api.createNetwork({ name, subnet: cidr })
        targetNetworkId = net.id
      }

      for (const host of toImport) {
        await api.createDevice({
          hostname: host.hostname,
          ip_address: host.ip_address,
          mac_address: host.mac_address ?? undefined,
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

  function toggleSelect(ip) {
    setSelected(prev => {
      const next = new Set(prev)
      if (next.has(ip)) next.delete(ip); else next.add(ip)
      return next
    })
  }

  const newCount = results?.filter(r => !r.already_registered).length ?? 0
  const selectedNewCount = results?.filter(r => selected.has(r.ip_address) && !r.already_registered).length ?? 0

  return (
    <div style={S.overlay} onClick={e => e.target === e.currentTarget && onClose()}>
      <div style={S.modal}>

        {/* 헤더 */}
        <div style={S.header}>
          <span style={S.title}>🔍 네트워크 스캔</span>
          <button style={S.closeBtn} onClick={onClose}>×</button>
        </div>

        {/* CIDR 입력 */}
        <div>
          <div style={S.label}>스캔할 서브넷 (CIDR)</div>
          <div style={{ display: 'flex', gap: 8 }}>
            <input
              style={S.input}
              value={cidr}
              onChange={e => setCidr(e.target.value)}
              placeholder="예: 192.168.1.0/24"
              onKeyDown={e => e.key === 'Enter' && !scanning && handleScan()}
            />
            <button
              style={{ ...S.btn, background: scanning ? '#2d3148' : '#4f5fef', color: '#fff', whiteSpace: 'nowrap' }}
              onClick={handleScan}
              disabled={scanning}
            >
              {scanning ? '스캔 중…' : '스캔 시작'}
            </button>
          </div>
          <div style={{ fontSize: 11, color: '#4a5568', marginTop: 5 }}>
            /24 기준 약 10~30초 소요됩니다
          </div>
        </div>

        {/* 스캔 중 스피너 */}
        {scanning && (
          <div style={{ textAlign: 'center', padding: '24px 0', color: '#64748b' }}>
            <div style={{ fontSize: 28, marginBottom: 8 }}>📡</div>
            <div style={{ fontSize: 13 }}>장비를 탐색하고 있습니다…</div>
          </div>
        )}

        {/* 결과 */}
        {results && !scanning && (
          <>
            {/* 요약 */}
            <div style={{ display: 'flex', gap: 12 }}>
              <Stat label="발견된 장비" value={results.length} color="#94a3b8" />
              <Stat label="신규" value={newCount} color="#4ade80" />
              <Stat label="이미 등록됨" value={results.length - newCount} color="#64748b" />
            </div>

            {/* 장비 목록 */}
            <div style={S.scrollBox}>
              {results.length === 0 && (
                <div style={{ color: '#4a5568', fontSize: 13, textAlign: 'center', padding: '20px 0' }}>
                  응답하는 장비가 없습니다
                </div>
              )}
              {results.map(r => {
                const isNew = !r.already_registered
                const isSel = selected.has(r.ip_address)
                return (
                  <div
                    key={r.ip_address}
                    style={{
                      ...S.row,
                      background: isSel && isNew ? '#1e2a1e' : '#0f1117',
                      border: `1px solid ${isSel && isNew ? '#2d5a2d' : '#1e2235'}`,
                      opacity: r.already_registered ? 0.5 : 1,
                      cursor: isNew ? 'pointer' : 'default',
                    }}
                    onClick={() => isNew && toggleSelect(r.ip_address)}
                  >
                    <input
                      type="checkbox"
                      checked={isSel && isNew}
                      disabled={!isNew}
                      onChange={() => toggleSelect(r.ip_address)}
                      onClick={e => e.stopPropagation()}
                      style={{ cursor: isNew ? 'pointer' : 'not-allowed' }}
                    />
                    <span style={{ fontFamily: 'monospace', fontSize: 13, color: '#94a3b8', minWidth: 120 }}>
                      {r.ip_address}
                    </span>
                    <span style={{ flex: 1, fontSize: 13, color: '#e2e8f0' }}>
                      {r.hostname !== r.ip_address ? r.hostname : '—'}
                    </span>
                    {r.mac_address && (
                      <span style={{ fontFamily: 'monospace', fontSize: 11, color: '#4a5568' }}>
                        {r.mac_address}
                      </span>
                    )}
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

            {/* 가져오기 설정 */}
            {newCount > 0 && (
              <div style={{ borderTop: '1px solid #2d3148', paddingTop: 14, display: 'flex', gap: 10, alignItems: 'flex-end', flexWrap: 'wrap' }}>
                <div style={{ flex: 1, minWidth: 150 }}>
                  <div style={S.label}>네트워크 배정</div>
                  <select
                    style={{ ...S.input, fontFamily: 'inherit' }}
                    value={networkId}
                    onChange={e => setNetworkId(e.target.value)}
                  >
                    <option value="__new__">+ 새 네트워크 만들기 ({cidr})</option>
                    {networks.map(n => (
                      <option key={n.id} value={n.id}>{n.name} ({n.subnet})</option>
                    ))}
                  </select>
                  {networkId === '__new__' && (
                    <input
                      style={{ ...S.input, marginTop: 6, fontFamily: 'inherit' }}
                      placeholder={`네트워크 이름 (기본값: ${cidr})`}
                      value={newNetworkName}
                      onChange={e => setNewNetworkName(e.target.value)}
                    />
                  )}
                </div>
                <div style={{ flex: 1, minWidth: 130 }}>
                  <div style={S.label}>장비 유형</div>
                  <select
                    style={{ ...S.input, fontFamily: 'inherit' }}
                    value={deviceType}
                    onChange={e => setDeviceType(e.target.value)}
                  >
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
          </>
        )}

        {error && <div style={{ color: '#fc8181', fontSize: 13 }}>{error}</div>}
      </div>
    </div>
  )
}

function Stat({ label, value, color }) {
  return (
    <div style={{ background: '#0f1117', border: '1px solid #1e2235', borderRadius: 8, padding: '8px 14px', textAlign: 'center' }}>
      <div style={{ fontSize: 20, fontWeight: 700, color }}>{value}</div>
      <div style={{ fontSize: 11, color: '#4a5568' }}>{label}</div>
    </div>
  )
}

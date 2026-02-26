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

// phase: 'detecting' | 'scanning' | 'done' | 'error'

export default function ScanDialog({ networks, onImport, onClose }) {
  const [phase, setPhase] = useState('detecting')
  const [progress, setProgress] = useState({ current: 0, total: 0, cidr: '', adapter: '' })
  const [scannedCidrs, setScannedCidrs] = useState([])
  const [results, setResults] = useState([])
  const [selected, setSelected] = useState(new Set())
  const [deviceType, setDeviceType] = useState('workstation')
  const [error, setError] = useState('')
  const [importing, setImporting] = useState(false)

  // 다이얼로그가 열리면 즉시 자동 스캔 시작
  useEffect(() => { runAutoScan() }, [])

  async function runAutoScan() {
    setPhase('detecting')
    setResults([])
    setError('')

    let ifaces = []
    try {
      ifaces = await api.getInterfaces()
    } catch (e) {
      setError(`인터페이스 감지 실패: ${e.message}`)
      setPhase('error')
      return
    }

    if (ifaces.length === 0) {
      setError('감지된 네트워크 인터페이스가 없습니다.')
      setPhase('error')
      return
    }

    setScannedCidrs(ifaces.map(i => i.cidr))
    setPhase('scanning')

    const allResults = []
    const seenHostnames = new Set()

    for (let i = 0; i < ifaces.length; i++) {
      const { cidr, adapter } = ifaces[i]
      setProgress({ current: i + 1, total: ifaces.length, cidr, adapter: adapter || '' })

      try {
        const sub = await api.scanNetwork(cidr)
        for (const r of sub) {
          const key = r.hostname.toLowerCase()
          // 이번 스캔 내 hostname 중복 제거 (다중 어댑터 동일 PC 방지)
          if (key !== r.ip_address.toLowerCase() && seenHostnames.has(key)) continue
          seenHostnames.add(key)
          allResults.push({ ...r, _cidr: cidr })  // 소속 CIDR 태깅
        }
      } catch (_) {
        // 해당 서브넷 스캔 실패는 무시하고 계속 진행
      }
    }

    setResults(allResults)
    setSelected(new Set(allResults.filter(r => !r.already_registered).map(r => r.ip_address)))
    setPhase('done')
    // 스캔 중 백엔드가 기존 장비 IP/네트워크를 갱신했을 수 있으므로 토폴로지 새로고침
    onImport()
  }

  async function handleImport() {
    const toImport = results.filter(r => selected.has(r.ip_address) && !r.already_registered)
    if (toImport.length === 0) { setError('가져올 신규 장비를 선택하세요'); return }

    setImporting(true)
    setError('')
    try {
      // CIDR별로 그룹핑
      const byCidr = {}
      for (const host of toImport) {
        const cidr = host._cidr || scannedCidrs[0] || '0.0.0.0/0'
        if (!byCidr[cidr]) byCidr[cidr] = []
        byCidr[cidr].push(host)
      }

      // 기존 네트워크 목록 최신화
      const currentNetworks = await api.listNetworks()

      for (const [cidr, hosts] of Object.entries(byCidr)) {
        // 같은 서브넷의 기존 네트워크 찾기
        let net = currentNetworks.find(n => n.subnet === cidr)
        if (!net) {
          net = await api.createNetwork({ name: cidr, subnet: cidr })
          currentNetworks.push(net)
        }
        for (const host of hosts) {
          await api.createDevice({
            hostname: host.hostname,
            ip_address: host.ip_address,
            mac_address: host.mac_address ?? undefined,
            device_type: deviceType,
            network_id: net.id,
            status: 'active',
          })
        }
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
      if (next.has(ip)) next.delete(ip); else next.add(ip)
      return next
    })
  }

  const newCount = results.filter(r => !r.already_registered).length
  const selectedNewCount = results.filter(r => selected.has(r.ip_address) && !r.already_registered).length

  return (
    <div style={S.overlay} onClick={e => e.target === e.currentTarget && onClose()}>
      <div style={S.modal}>

        {/* 헤더 */}
        <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
          <span style={{ fontSize: 16, fontWeight: 700, color: '#e2e8f0' }}>🔍 네트워크 자동 스캔</span>
          <button onClick={onClose} style={{ background: 'none', border: 'none', color: '#718096', cursor: 'pointer', fontSize: 20 }}>×</button>
        </div>

        {/* 감지 중 */}
        {phase === 'detecting' && (
          <div style={{ textAlign: 'center', padding: '32px 0', color: '#64748b' }}>
            <div style={{ fontSize: 32, marginBottom: 10 }}>📡</div>
            <div style={{ fontSize: 14 }}>네트워크 인터페이스 감지 중…</div>
          </div>
        )}

        {/* 스캔 중 */}
        {phase === 'scanning' && (
          <div style={{ display: 'flex', flexDirection: 'column', gap: 12 }}>
            <div style={{ textAlign: 'center', padding: '16px 0', color: '#64748b' }}>
              <div style={{ fontSize: 32, marginBottom: 8 }}>📡</div>
              <div style={{ fontSize: 14, color: '#94a3b8' }}>
                {progress.adapter ? `${progress.adapter} ` : ''}스캔 중
              </div>
              <div style={{ fontSize: 12, color: '#64748b', marginTop: 2, fontFamily: 'monospace' }}>
                {progress.cidr}
              </div>
              <div style={{ fontSize: 12, color: '#4a5568', marginTop: 4 }}>
                {progress.current} / {progress.total} 서브넷
              </div>
            </div>
            {/* 진행 바 */}
            <div style={{ background: '#0f1117', borderRadius: 4, height: 6, overflow: 'hidden' }}>
              <div style={{
                height: '100%', borderRadius: 4, background: '#4f5fef',
                width: `${(progress.current / progress.total) * 100}%`,
                transition: 'width 0.4s ease',
              }} />
            </div>
            <div style={{ fontSize: 11, color: '#4a5568', textAlign: 'center' }}>
              감지된 서브넷: {scannedCidrs.join(', ')}
            </div>
          </div>
        )}

        {/* 오류 */}
        {phase === 'error' && (
          <div style={{ textAlign: 'center', padding: '20px 0', color: '#fc8181' }}>
            <div style={{ fontSize: 28, marginBottom: 8 }}>⚠️</div>
            <div>{error}</div>
            <button style={{ ...S.btn, background: '#2d3148', color: '#94a3b8', marginTop: 12 }} onClick={runAutoScan}>
              다시 시도
            </button>
          </div>
        )}

        {/* 결과 */}
        {phase === 'done' && (
          <>
            {/* 스캔 범위 */}
            <div style={{ fontSize: 12, color: '#4a5568' }}>
              스캔 범위: <span style={{ color: '#64748b', fontFamily: 'monospace' }}>{scannedCidrs.join(', ')}</span>
              <button onClick={runAutoScan} style={{ marginLeft: 10, background: 'none', border: 'none', color: '#4f5fef', fontSize: 12, cursor: 'pointer' }}>
                ↺ 다시 스캔
              </button>
            </div>

            {/* 요약 */}
            <div style={{ display: 'flex', gap: 10 }}>
              <Stat label="발견" value={results.length} color="#94a3b8" />
              <Stat label="신규" value={newCount} color="#4ade80" />
              <Stat label="등록됨" value={results.length - newCount} color="#4a5568" />
            </div>

            {/* 장비 목록 */}
            <div style={S.scrollBox}>
              {results.length === 0 ? (
                <div style={{ color: '#4a5568', fontSize: 13, textAlign: 'center', padding: '20px 0' }}>
                  응답하는 장비가 없습니다
                </div>
              ) : results.map(r => {
                const isNew = !r.already_registered
                const isSel = selected.has(r.ip_address)
                return (
                  <div
                    key={r.ip_address}
                    onClick={() => isNew && toggle(r.ip_address)}
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
                      onChange={() => toggle(r.ip_address)}
                      onClick={e => e.stopPropagation()}
                    />
                    <span style={{ fontFamily: 'monospace', fontSize: 13, color: '#94a3b8', minWidth: 120 }}>
                      {r.ip_address}
                    </span>
                    <div style={{ flex: 1 }}>
                      <div style={{ fontSize: 13, color: '#e2e8f0' }}>
                        {r.hostname !== r.ip_address ? r.hostname : '—'}
                      </div>
                      <div style={{ fontSize: 11, color: '#64748b', marginTop: 2, display: 'flex', gap: 6 }}>
                        {r.vendor && <span style={{ color: '#7dd3fc' }}>{r.vendor}</span>}
                        {r.role && <span>🔀 {r.role}</span>}
                      </div>
                    </div>
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

            {/* 가져오기 */}
            {newCount > 0 && (
              <div style={{ borderTop: '1px solid #2d3148', paddingTop: 14, display: 'flex', gap: 10, alignItems: 'flex-end', flexWrap: 'wrap' }}>
                <div style={{ flex: 1, minWidth: 150 }}>
                  <div style={{ fontSize: 11, color: '#64748b' }}>
                    서브넷별 자동 배정: {[...new Set(results.filter(r => selected.has(r.ip_address) && !r.already_registered).map(r => r._cidr))].join(', ') || '—'}
                  </div>
                </div>
                <div style={{ minWidth: 120 }}>
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

import { useState, useEffect } from 'react'
import { api } from '../api/client.js'

const S = {
  overlay: {
    position: 'fixed', inset: 0, background: 'rgba(0,0,0,0.65)',
    display: 'flex', alignItems: 'center', justifyContent: 'center', zIndex: 200,
  },
  modal: {
    background: '#1a1d27', border: '1px solid #2d3148', borderRadius: 12,
    padding: 24, width: 500, maxWidth: '95vw', maxHeight: '85vh',
    display: 'flex', flexDirection: 'column', gap: 16,
  },
  btn: { padding: '9px 18px', borderRadius: 7, border: 'none', cursor: 'pointer', fontWeight: 600, fontSize: 13 },
  row: {
    display: 'flex', alignItems: 'center', gap: 10,
    padding: '8px 10px', borderRadius: 7, marginBottom: 3,
  },
  badge: { fontSize: 11, padding: '2px 8px', borderRadius: 10, fontWeight: 600 },
  scrollBox: { overflowY: 'auto', maxHeight: 300, flex: 1 },
}

const BT_EMOJI = { bt_audio: '🎧', bt_input: '🖱️', bt_other: '📶' }

export default function BluetoothDialog({ onImport, onClose }) {
  const [phase, setPhase] = useState('scanning') // scanning | done | error
  const [results, setResults] = useState([])
  const [selected, setSelected] = useState(new Set())
  const [error, setError] = useState('')
  const [importing, setImporting] = useState(false)

  useEffect(() => { runScan() }, [])

  async function runScan() {
    setPhase('scanning')
    setResults([])
    setError('')
    try {
      const data = await api.scanBluetooth()
      setResults(data)
      setSelected(new Set(
        data.filter(d => !d.already_registered && d.mac_address).map(d => d.mac_address)
      ))
      setPhase('done')
    } catch (e) {
      setError(`블루투스 스캔 실패: ${e.message}`)
      setPhase('error')
    }
  }

  async function handleImport() {
    const toImport = results.filter(
      r => selected.has(r.mac_address) && !r.already_registered && r.mac_address
    )
    if (toImport.length === 0) { setError('가져올 장치를 선택하세요'); return }

    setImporting(true)
    setError('')
    try {
      const devices = toImport.map(r => ({
        name: r.name,
        mac_address: r.mac_address,
        device_type: guessType(r.name),
      }))
      const result = await api.importBluetooth(devices)
      if (result.imported === 0) {
        setError('이미 등록된 장치이거나 가져올 수 없습니다')
        return
      }
      await onImport()
      onClose()
    } catch (e) {
      setError(e.message)
    } finally {
      setImporting(false)
    }
  }

  function guessType(name) {
    const n = name.toLowerCase()
    if (['headphone', 'headset', 'earphone', 'buds', 'speaker', 'audio', 'airpods', 'soundbar'].some(kw => n.includes(kw))) return 'bt_audio'
    if (['mouse', 'keyboard', 'gamepad', 'controller', 'pen', 'stylus'].some(kw => n.includes(kw))) return 'bt_input'
    return 'bt_other'
  }

  function toggle(mac) {
    setSelected(prev => {
      const next = new Set(prev)
      if (next.has(mac)) next.delete(mac); else next.add(mac)
      return next
    })
  }

  const newCount = results.filter(r => !r.already_registered && r.mac_address).length
  const selectedNewCount = results.filter(
    r => selected.has(r.mac_address) && !r.already_registered
  ).length

  return (
    <div style={S.overlay} onClick={e => e.target === e.currentTarget && onClose()}>
      <div style={S.modal}>
        {/* 헤더 */}
        <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
          <span style={{ fontSize: 16, fontWeight: 700, color: '#e2e8f0' }}>📶 블루투스 장치 스캔</span>
          <button onClick={onClose} style={{ background: 'none', border: 'none', color: '#718096', cursor: 'pointer', fontSize: 20 }}>×</button>
        </div>

        {/* 스캔 중 */}
        {phase === 'scanning' && (
          <div style={{ textAlign: 'center', padding: '32px 0', color: '#64748b' }}>
            <div style={{ fontSize: 32, marginBottom: 10 }}>📶</div>
            <div style={{ fontSize: 14 }}>블루투스 장치 검색 중…</div>
          </div>
        )}

        {/* 오류 */}
        {phase === 'error' && (
          <div style={{ textAlign: 'center', padding: '20px 0', color: '#fc8181' }}>
            <div style={{ fontSize: 28, marginBottom: 8 }}>⚠️</div>
            <div>{error}</div>
            <button style={{ ...S.btn, background: '#2d3148', color: '#94a3b8', marginTop: 12 }} onClick={runScan}>
              다시 시도
            </button>
          </div>
        )}

        {/* 결과 */}
        {phase === 'done' && (
          <>
            {/* 요약 */}
            <div style={{ display: 'flex', gap: 10 }}>
              <Stat label="발견" value={results.length} color="#94a3b8" />
              <Stat label="신규" value={newCount} color="#818cf8" />
              <Stat label="등록됨" value={results.length - newCount} color="#4a5568" />
            </div>

            {/* 장치 목록 */}
            <div style={S.scrollBox}>
              {results.length === 0 ? (
                <div style={{ color: '#4a5568', fontSize: 13, textAlign: 'center', padding: '20px 0' }}>
                  페어링된 블루투스 장치가 없습니다
                </div>
              ) : results.map(r => {
                const isNew = !r.already_registered && !!r.mac_address
                const isSel = selected.has(r.mac_address)
                const emoji = BT_EMOJI[guessType(r.name)] || '📶'
                return (
                  <div
                    key={r.mac_address || r.name}
                    onClick={() => isNew && toggle(r.mac_address)}
                    style={{
                      ...S.row,
                      background: isSel && isNew ? '#1e1e2e' : '#0f1117',
                      border: `1px solid ${isSel && isNew ? '#4338ca' : '#1e2235'}`,
                      opacity: isNew ? 1 : 0.45,
                      cursor: isNew ? 'pointer' : 'default',
                    }}
                  >
                    <input
                      type="checkbox" checked={isSel && isNew} disabled={!isNew}
                      onChange={() => toggle(r.mac_address)}
                      onClick={e => e.stopPropagation()}
                    />
                    <span style={{ fontSize: 18 }}>{emoji}</span>
                    <div style={{ flex: 1 }}>
                      <div style={{ fontSize: 13, color: '#e2e8f0' }}>{r.name}</div>
                      <div style={{ fontSize: 11, color: '#64748b', marginTop: 2, display: 'flex', gap: 6 }}>
                        {r.vendor && <span style={{ color: '#7dd3fc' }}>{r.vendor}</span>}
                        <span>{r.status}</span>
                      </div>
                    </div>
                    {r.mac_address && (
                      <span style={{ fontFamily: 'monospace', fontSize: 11, color: '#4a5568' }}>
                        {r.mac_address}
                      </span>
                    )}
                    <span style={{
                      ...S.badge,
                      background: isNew ? '#1e1b4b' : '#1e2235',
                      color: isNew ? '#818cf8' : '#4a5568',
                    }}>
                      {isNew ? '신규' : !r.mac_address ? 'MAC 없음' : '등록됨'}
                    </span>
                  </div>
                )
              })}
            </div>

            {/* 가져오기 */}
            {newCount > 0 && (
              <div style={{ borderTop: '1px solid #2d3148', paddingTop: 14, display: 'flex', gap: 10, alignItems: 'center', justifyContent: 'flex-end' }}>
                <button onClick={runScan} style={{ ...S.btn, background: '#2d3148', color: '#94a3b8' }}>
                  ↺ 다시 스캔
                </button>
                <button
                  style={{ ...S.btn, background: selectedNewCount ? '#4338ca' : '#2d3148', color: '#fff' }}
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

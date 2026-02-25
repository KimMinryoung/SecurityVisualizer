import { useState, useEffect } from 'react'
import { api } from '../api/client.js'

const S = {
  panel: {
    width: '300px', flexShrink: 0, background: '#1a1d27',
    borderLeft: '1px solid #2d3148', overflowY: 'auto',
    display: 'flex', flexDirection: 'column',
  },
  header: {
    padding: '16px', borderBottom: '1px solid #2d3148',
    fontSize: '13px', fontWeight: 600, color: '#7c8cf8', textTransform: 'uppercase', letterSpacing: '0.05em',
  },
  empty: {
    padding: '32px 16px', color: '#4a5568', fontSize: '13px', textAlign: 'center',
  },
  body: { padding: '16px', flex: 1 },
  row: { marginBottom: '10px' },
  label: { fontSize: '11px', color: '#4a5568', textTransform: 'uppercase', letterSpacing: '0.05em', marginBottom: '2px' },
  value: { fontSize: '13px', color: '#cbd5e0' },
  section: { marginTop: '20px', paddingTop: '16px', borderTop: '1px solid #2d3148' },
  sectionTitle: { fontSize: '12px', fontWeight: 600, color: '#7c8cf8', marginBottom: '10px', textTransform: 'uppercase' },
  tag: {
    display: 'inline-block', padding: '2px 8px', borderRadius: '12px',
    fontSize: '11px', fontWeight: 500, marginRight: '4px', marginBottom: '4px',
  },
}

const TYPE_COLORS = {
  antivirus: '#38a169',
  EDR: '#3182ce',
  DRM: '#805ad5',
  firewall: '#dd6b20',
  other: '#718096',
}

const SEVERITY_COLORS = { critical: '#dc2626', high: '#ea580c', medium: '#d97706', low: '#65a30d' }

const STATUS_COLORS = {
  active: '#38a169',
  inactive: '#718096',
  outdated: '#d69e2e',
}

export default function DevicePanel({ selectedNode, myDeviceId, gatewayRoles = {}, onSetMyDevice, onDeselect, onRefresh }) {
  const [device, setDevice] = useState(null)
  const [allSolutions, setAllSolutions] = useState([])
  const [loading, setLoading] = useState(false)
  const [assignError, setAssignError] = useState('')
  const [confirmDelete, setConfirmDelete] = useState(false)
  const [showNewSol, setShowNewSol] = useState(false)
  const [newSol, setNewSol] = useState({ name: '', type: 'antivirus', vendor: '' })
  const [vulns, setVulns] = useState([])
  const [showAddVuln, setShowAddVuln] = useState(false)
  const [newVuln, setNewVuln] = useState({ cve_id: '', title: '', severity: 'medium', description: '' })
  const [vulnError, setVulnError] = useState('')
  const [autoscanLoading, setAutoscanLoading] = useState(false)
  const [autoscanMsg, setAutoscanMsg] = useState('')

  useEffect(() => {
    setConfirmDelete(false)
    setVulns([])
    setShowAddVuln(false)
    setVulnError('')
    setAutoscanLoading(false)
    setAutoscanMsg('')
    if (selectedNode?.type !== 'device') { setDevice(null); return }
    const devId = selectedNode.data.deviceId
    setLoading(true)
    Promise.all([api.getDevice(devId), api.listDeviceVulns(devId)])
      .then(([dev, vs]) => { setDevice(dev); setVulns(vs) })
      .finally(() => setLoading(false))
  }, [selectedNode])

  async function loadVulns(devId) {
    const vs = await api.listDeviceVulns(devId)
    setVulns(vs)
  }

  async function handleAddVuln(e) {
    e.preventDefault()
    setVulnError('')
    try {
      await api.addVuln(device.id, {
        cve_id: newVuln.cve_id || undefined,
        title: newVuln.title,
        severity: newVuln.severity,
        description: newVuln.description || undefined,
        status: 'open',
      })
      await loadVulns(device.id)
      setShowAddVuln(false)
      setNewVuln({ cve_id: '', title: '', severity: 'medium', description: '' })
      onRefresh()
    } catch (e) {
      setVulnError(e.message)
    }
  }

  async function handleVulnStatus(vid, status) {
    try {
      await api.updateVulnStatus(device.id, vid, { status })
      await loadVulns(device.id)
      onRefresh()
    } catch (e) {
      setVulnError(e.message)
    }
  }

  async function handleDeleteVuln(vid) {
    try {
      await api.deleteVuln(device.id, vid)
      await loadVulns(device.id)
      onRefresh()
    } catch (e) {
      setVulnError(e.message)
    }
  }

  async function handleAutoscan() {
    setAutoscanLoading(true)
    setAutoscanMsg('')
    try {
      const result = await api.autoscanVulns(device.id)
      if (result.added > 0) {
        setAutoscanMsg(`✅ ${result.added}개 취약점이 추가되었습니다`)
      } else {
        setAutoscanMsg(`이미 최신 상태입니다 (${result.skipped}개 스킵)`)
      }
      await loadVulns(device.id)
      onRefresh()
    } catch (e) {
      setAutoscanMsg(`오류: ${e.message}`)
    } finally {
      setAutoscanLoading(false)
    }
  }

  useEffect(() => {
    api.listSolutions().then(setAllSolutions)
  }, [])

  async function handleAssign(solutionId) {
    setAssignError('')
    try {
      await api.assignSolution(device.id, { solution_id: parseInt(solutionId), status: 'active' })
      const updated = await api.getDevice(device.id)
      setDevice(updated)
    } catch (e) {
      setAssignError(e.message)
    }
  }

  async function handleDelete() {
    try {
      await api.deleteDevice(device.id)
      onDeselect()
      onRefresh()
    } catch (e) {
      setAssignError(e.message)
    }
  }

  async function handleCreateAndAssign(e) {
    e.preventDefault()
    setAssignError('')
    try {
      const created = await api.createSolution({ name: newSol.name, type: newSol.type, vendor: newSol.vendor || undefined })
      const updated = await api.listSolutions()
      setAllSolutions(updated)
      await api.assignSolution(device.id, { solution_id: created.id, status: 'active' })
      const refreshed = await api.getDevice(device.id)
      setDevice(refreshed)
      setShowNewSol(false)
      setNewSol({ name: '', type: 'antivirus', vendor: '' })
      onRefresh()
    } catch (e) {
      setAssignError(e.message)
    }
  }

  async function handleUnassign(assignmentId) {
    setAssignError('')
    try {
      await api.unassignSolution(device.id, assignmentId)
      const updated = await api.getDevice(device.id)
      setDevice(updated)
    } catch (e) {
      setAssignError(e.message)
    }
  }

  const assignedIds = new Set(device?.device_solutions?.map(ds => ds.solution_id) ?? [])
  const unassigned = allSolutions.filter(s => !assignedIds.has(s.id))

  return (
    <div style={S.panel}>
      <div style={S.header}>
        {selectedNode ? (selectedNode.type === 'device' ? 'Device Details' : 'Network Details') : 'Details'}
      </div>

      {!selectedNode && (
        <div style={S.empty}>
          <div style={{ fontSize: 28, marginBottom: 10 }}>👆</div>
          <div style={{ marginBottom: 6 }}>노드를 클릭하면 상세 정보가 표시됩니다</div>
          {!myDeviceId && (
            <div style={{ marginTop: 12, fontSize: 12, color: '#2d3f55', lineHeight: 1.6 }}>
              💡 내 PC 노드를 클릭한 뒤<br/>
              <strong style={{ color: '#4a5568' }}>"이 PC가 내 PC입니다"</strong>를<br/>
              눌러 설정하세요
            </div>
          )}
        </div>
      )}

      {selectedNode?.type === 'network' && (
        <div style={S.body}>
          <InfoRow label="Name" value={selectedNode.data.name} />
          <InfoRow label="Subnet" value={selectedNode.data.subnet} />
          <InfoRow label="Gateway" value={selectedNode.data.gateway || '—'} />
          <InfoRow label="VLAN" value={selectedNode.data.vlan_id ?? '—'} />
          <InfoRow label="Description" value={selectedNode.data.description || '—'} />
        </div>
      )}

      {selectedNode?.type === 'device' && (
        <div style={S.body}>
          {loading && <div style={S.empty}>Loading…</div>}
          {!loading && device && (
            <>
              {/* 게이트웨이 역할 배지 */}
              {gatewayRoles[device.ip_address] && (
                <div style={{
                  display: 'flex', alignItems: 'center', gap: 8,
                  background: '#1a2535', border: '1px solid #2d4a6a',
                  borderRadius: 8, padding: '8px 12px', marginBottom: 12,
                }}>
                  <span style={{ fontSize: 18 }}>🔀</span>
                  <div>
                    <div style={{ fontSize: 13, fontWeight: 700, color: '#7dd3fc' }}>게이트웨이</div>
                    <div style={{ fontSize: 11, color: '#4a7fa5' }}>{gatewayRoles[device.ip_address]}</div>
                  </div>
                </div>
              )}

              {/* 내 PC 표식 */}
              {String(device.id) === String(myDeviceId) ? (
                <div style={{
                  display: 'flex', alignItems: 'center', gap: 8,
                  background: '#78350f', border: '1px solid #fbbf24',
                  borderRadius: 8, padding: '8px 12px', marginBottom: 16,
                }}>
                  <span style={{ fontSize: 20 }}>📍</span>
                  <div>
                    <div style={{ fontSize: 13, fontWeight: 700, color: '#fcd34d' }}>내 PC</div>
                    <div style={{ fontSize: 11, color: '#d97706' }}>접속 IP로 자동 감지된 기기입니다</div>
                  </div>
                </div>
              ) : (
                // 자동 감지 실패 시(로컬 개발 등) 수동 선택 폴백
                <button
                  onClick={() => onSetMyDevice(device.id)}
                  style={{
                    width: '100%', marginBottom: 16, padding: '8px 0',
                    background: '#1e2235', border: '1px solid #2d3148',
                    borderRadius: 8, color: '#94a3b8', fontSize: 13,
                    cursor: 'pointer', display: 'flex', alignItems: 'center',
                    justifyContent: 'center', gap: 6,
                  }}
                >
                  <span>📍</span> 이 PC가 내 PC입니다
                </button>
              )}

              <InfoRow label="Hostname" value={device.hostname} />
              <InfoRow label="IP Address" value={device.ip_address} />
              <InfoRow label="MAC" value={device.mac_address || '—'} />
              <InfoRow label="Vendor" value={device.vendor || '—'} />
              <InfoRow label="OS" value={device.os || '—'} />
              <InfoRow label="Type" value={device.device_type || '—'} />
              <InfoRow label="Status">
                <span style={{ color: STATUS_COLORS[device.status] || '#718096' }}>{device.status}</span>
              </InfoRow>

              <div style={S.section}>
                <div style={S.sectionTitle}>Security Solutions</div>
                {device.device_solutions.length === 0 && (
                  <div style={{ color: '#fc8181', fontSize: '12px' }}>No solutions installed</div>
                )}
                {device.device_solutions.map(ds => (
                  <div key={ds.id} style={{ display: 'flex', alignItems: 'center', marginBottom: '6px', gap: '6px' }}>
                    <span style={{
                      ...S.tag,
                      background: TYPE_COLORS[ds.solution.type] + '22',
                      color: TYPE_COLORS[ds.solution.type] || '#718096',
                      border: `1px solid ${TYPE_COLORS[ds.solution.type] || '#718096'}44`,
                    }}>
                      {ds.solution.type}
                    </span>
                    <span style={{ flex: 1, fontSize: '12px', color: '#e2e8f0' }}>{ds.solution.name}</span>
                    <span style={{ fontSize: '11px', color: STATUS_COLORS[ds.status] || '#718096' }}>{ds.status}</span>
                    <button
                      onClick={() => handleUnassign(ds.id)}
                      style={{ background: 'none', border: 'none', color: '#4a5568', cursor: 'pointer', fontSize: '14px', lineHeight: 1 }}
                      title="Remove"
                    >×</button>
                  </div>
                ))}

                {unassigned.length > 0 && (
                  <div style={{ marginTop: '12px' }}>
                    <div style={{ ...S.label, marginBottom: '6px' }}>Assign solution</div>
                    <select
                      style={{
                        width: '100%', padding: '6px 8px', background: '#0f1117',
                        border: '1px solid #2d3148', borderRadius: '6px', color: '#e2e8f0', fontSize: '12px',
                      }}
                      defaultValue=""
                      onChange={e => { if (e.target.value) handleAssign(e.target.value); e.target.value = '' }}
                    >
                      <option value="">+ Assign…</option>
                      {unassigned.map(s => (
                        <option key={s.id} value={s.id}>{s.name} ({s.type})</option>
                      ))}
                    </select>
                  </div>
                )}

                {/* 새 솔루션 추가 */}
                {!showNewSol ? (
                  <button
                    onClick={() => setShowNewSol(true)}
                    style={{
                      marginTop: 10, width: '100%', padding: '5px 0',
                      background: 'none', border: '1px dashed #2d3148',
                      borderRadius: 6, color: '#4a5568', fontSize: 12, cursor: 'pointer',
                    }}
                  >
                    + 새 솔루션 추가
                  </button>
                ) : (
                  <form onSubmit={handleCreateAndAssign} style={{ marginTop: 10, background: '#0f1117', border: '1px solid #2d3148', borderRadius: 8, padding: '10px 12px' }}>
                    <div style={{ fontSize: 11, color: '#7c8cf8', fontWeight: 600, marginBottom: 8, textTransform: 'uppercase' }}>새 솔루션 등록 &amp; 할당</div>
                    <input
                      required
                      placeholder="이름 (예: Windows Defender)"
                      value={newSol.name}
                      onChange={e => setNewSol(s => ({ ...s, name: e.target.value }))}
                      style={{ width: '100%', padding: '5px 8px', background: '#1a1d27', border: '1px solid #2d3148', borderRadius: 5, color: '#e2e8f0', fontSize: 12, marginBottom: 6, boxSizing: 'border-box' }}
                    />
                    <select
                      value={newSol.type}
                      onChange={e => setNewSol(s => ({ ...s, type: e.target.value }))}
                      style={{ width: '100%', padding: '5px 8px', background: '#1a1d27', border: '1px solid #2d3148', borderRadius: 5, color: '#e2e8f0', fontSize: 12, marginBottom: 6 }}
                    >
                      {['antivirus', 'EDR', 'DRM', 'firewall', 'other'].map(t => <option key={t} value={t}>{t}</option>)}
                    </select>
                    <input
                      placeholder="제조사 (선택)"
                      value={newSol.vendor}
                      onChange={e => setNewSol(s => ({ ...s, vendor: e.target.value }))}
                      style={{ width: '100%', padding: '5px 8px', background: '#1a1d27', border: '1px solid #2d3148', borderRadius: 5, color: '#e2e8f0', fontSize: 12, marginBottom: 8, boxSizing: 'border-box' }}
                    />
                    <div style={{ display: 'flex', gap: 6 }}>
                      <button type="submit" style={{ flex: 1, padding: '5px 0', background: '#4f5fef', border: 'none', borderRadius: 5, color: '#fff', fontSize: 12, cursor: 'pointer', fontWeight: 600 }}>등록 &amp; 할당</button>
                      <button type="button" onClick={() => setShowNewSol(false)} style={{ flex: 1, padding: '5px 0', background: '#2d3148', border: 'none', borderRadius: 5, color: '#94a3b8', fontSize: 12, cursor: 'pointer' }}>취소</button>
                    </div>
                  </form>
                )}

                {assignError && <p style={{ color: '#fc8181', fontSize: '12px', marginTop: 6 }}>{assignError}</p>}
              </div>

              {/* Vulnerabilities */}
              <div style={S.section}>
                <div style={S.sectionTitle}>Vulnerabilities</div>

                {/* OS 기반 자동 스캔 버튼 */}
                <div style={{ marginBottom: 10 }}>
                  <button
                    onClick={handleAutoscan}
                    disabled={!device.os || autoscanLoading}
                    title={!device.os ? 'OS 정보 없음' : 'OS 정보를 기반으로 알려진 CVE를 자동 등록합니다'}
                    style={{
                      width: '100%', padding: '6px 0',
                      background: device.os ? '#1e2a3a' : '#1a1d27',
                      border: `1px solid ${device.os ? '#2d4a6a' : '#2d3148'}`,
                      borderRadius: 6, color: device.os ? '#7dd3fc' : '#3a4055',
                      fontSize: 12, cursor: device.os ? 'pointer' : 'not-allowed',
                      display: 'flex', alignItems: 'center', justifyContent: 'center', gap: 5,
                    }}
                  >
                    {autoscanLoading ? '⏳ 스캔 중…' : '🔍 OS 기반 자동 스캔'}
                  </button>
                  {autoscanMsg && (
                    <div style={{
                      marginTop: 5, fontSize: 11, textAlign: 'center',
                      color: autoscanMsg.startsWith('✅') ? '#4ade80' : '#94a3b8',
                    }}>
                      {autoscanMsg}
                    </div>
                  )}
                </div>

                {vulns.length === 0 && (
                  <div style={{ color: '#4a5568', fontSize: '12px' }}>취약점 없음</div>
                )}
                {vulns.map(v => {
                  const patched = v.status !== 'open'
                  return (
                    <div key={v.id} style={{
                      marginBottom: 8, padding: '7px 10px',
                      background: '#0f1117', borderRadius: 7,
                      border: `1px solid ${patched ? '#2d3148' : (SEVERITY_COLORS[v.severity] + '44')}`,
                      opacity: patched ? 0.55 : 1,
                    }}>
                      <div style={{ display: 'flex', alignItems: 'center', gap: 6, marginBottom: 3 }}>
                        {v.cve_id && (
                          <span style={{ fontSize: 10, color: '#94a3b8', fontFamily: 'monospace' }}>{v.cve_id}</span>
                        )}
                        <span style={{
                          fontSize: 10, padding: '1px 6px', borderRadius: 8,
                          background: SEVERITY_COLORS[v.severity] + '22',
                          color: SEVERITY_COLORS[v.severity],
                          border: `1px solid ${SEVERITY_COLORS[v.severity]}44`,
                          fontWeight: 600, textTransform: 'uppercase',
                        }}>{v.severity}</span>
                        <span style={{ fontSize: 10, color: '#64748b', marginLeft: 'auto' }}>{v.status}</span>
                      </div>
                      <div style={{ fontSize: 12, color: patched ? '#64748b' : '#e2e8f0', textDecoration: patched ? 'line-through' : 'none' }}>
                        {v.title}
                      </div>
                      {!patched && (
                        <div style={{ display: 'flex', gap: 5, marginTop: 6 }}>
                          <button
                            onClick={() => handleVulnStatus(v.id, 'patched')}
                            style={{ flex: 1, padding: '3px 0', background: '#14532d', border: 'none', borderRadius: 5, color: '#4ade80', fontSize: 11, cursor: 'pointer' }}
                          >패치</button>
                          <button
                            onClick={() => handleVulnStatus(v.id, 'ignored')}
                            style={{ flex: 1, padding: '3px 0', background: '#1e2235', border: '1px solid #2d3148', borderRadius: 5, color: '#94a3b8', fontSize: 11, cursor: 'pointer' }}
                          >무시</button>
                          <button
                            onClick={() => handleDeleteVuln(v.id)}
                            style={{ padding: '3px 8px', background: 'none', border: 'none', color: '#4a5568', cursor: 'pointer', fontSize: 14 }}
                          >×</button>
                        </div>
                      )}
                      {patched && (
                        <button
                          onClick={() => handleDeleteVuln(v.id)}
                          style={{ marginTop: 4, padding: '2px 8px', background: 'none', border: 'none', color: '#4a5568', cursor: 'pointer', fontSize: 12 }}
                        >삭제</button>
                      )}
                    </div>
                  )
                })}

                {!showAddVuln ? (
                  <button
                    onClick={() => setShowAddVuln(true)}
                    style={{
                      marginTop: 8, width: '100%', padding: '5px 0',
                      background: 'none', border: '1px dashed #2d3148',
                      borderRadius: 6, color: '#4a5568', fontSize: 12, cursor: 'pointer',
                    }}
                  >
                    + 취약점 추가
                  </button>
                ) : (
                  <form onSubmit={handleAddVuln} style={{ marginTop: 8, background: '#0f1117', border: '1px solid #2d3148', borderRadius: 8, padding: '10px 12px' }}>
                    <div style={{ fontSize: 11, color: '#7c8cf8', fontWeight: 600, marginBottom: 8, textTransform: 'uppercase' }}>취약점 등록</div>
                    <input
                      placeholder="CVE ID (예: CVE-2024-1234, 선택)"
                      value={newVuln.cve_id}
                      onChange={e => setNewVuln(s => ({ ...s, cve_id: e.target.value }))}
                      style={{ width: '100%', padding: '5px 8px', background: '#1a1d27', border: '1px solid #2d3148', borderRadius: 5, color: '#e2e8f0', fontSize: 12, marginBottom: 6, boxSizing: 'border-box' }}
                    />
                    <input
                      required
                      placeholder="제목 *"
                      value={newVuln.title}
                      onChange={e => setNewVuln(s => ({ ...s, title: e.target.value }))}
                      style={{ width: '100%', padding: '5px 8px', background: '#1a1d27', border: '1px solid #2d3148', borderRadius: 5, color: '#e2e8f0', fontSize: 12, marginBottom: 6, boxSizing: 'border-box' }}
                    />
                    <select
                      value={newVuln.severity}
                      onChange={e => setNewVuln(s => ({ ...s, severity: e.target.value }))}
                      style={{ width: '100%', padding: '5px 8px', background: '#1a1d27', border: '1px solid #2d3148', borderRadius: 5, color: '#e2e8f0', fontSize: 12, marginBottom: 6 }}
                    >
                      {['critical', 'high', 'medium', 'low'].map(sev => <option key={sev} value={sev}>{sev}</option>)}
                    </select>
                    <textarea
                      placeholder="설명 (선택)"
                      value={newVuln.description}
                      onChange={e => setNewVuln(s => ({ ...s, description: e.target.value }))}
                      rows={2}
                      style={{ width: '100%', padding: '5px 8px', background: '#1a1d27', border: '1px solid #2d3148', borderRadius: 5, color: '#e2e8f0', fontSize: 12, marginBottom: 8, boxSizing: 'border-box', resize: 'vertical' }}
                    />
                    {vulnError && <p style={{ color: '#fc8181', fontSize: '11px', marginBottom: 6 }}>{vulnError}</p>}
                    <div style={{ display: 'flex', gap: 6 }}>
                      <button type="submit" style={{ flex: 1, padding: '5px 0', background: '#dc2626', border: 'none', borderRadius: 5, color: '#fff', fontSize: 12, cursor: 'pointer', fontWeight: 600 }}>등록</button>
                      <button type="button" onClick={() => { setShowAddVuln(false); setVulnError('') }} style={{ flex: 1, padding: '5px 0', background: '#2d3148', border: 'none', borderRadius: 5, color: '#94a3b8', fontSize: 12, cursor: 'pointer' }}>취소</button>
                    </div>
                  </form>
                )}
              </div>

              {/* 장비 삭제 */}
              <div style={{ marginTop: 24, paddingTop: 16, borderTop: '1px solid #2d3148' }}>
                {!confirmDelete ? (
                  <button
                    onClick={() => setConfirmDelete(true)}
                    style={{
                      width: '100%', padding: '7px 0', background: 'none',
                      border: '1px solid #4a3030', borderRadius: 7,
                      color: '#7a4040', fontSize: 12, cursor: 'pointer',
                    }}
                  >
                    이 장비 삭제
                  </button>
                ) : (
                  <div style={{ background: '#2d1515', border: '1px solid #7f1d1d', borderRadius: 7, padding: '10px 12px' }}>
                    <div style={{ fontSize: 12, color: '#fca5a5', marginBottom: 8 }}>
                      정말 삭제하시겠습니까?
                    </div>
                    <div style={{ display: 'flex', gap: 6 }}>
                      <button
                        onClick={handleDelete}
                        style={{ flex: 1, padding: '6px 0', background: '#dc2626', border: 'none', borderRadius: 6, color: '#fff', fontSize: 12, cursor: 'pointer', fontWeight: 600 }}
                      >
                        삭제
                      </button>
                      <button
                        onClick={() => setConfirmDelete(false)}
                        style={{ flex: 1, padding: '6px 0', background: '#2d3148', border: 'none', borderRadius: 6, color: '#94a3b8', fontSize: 12, cursor: 'pointer' }}
                      >
                        취소
                      </button>
                    </div>
                  </div>
                )}
              </div>
            </>
          )}
        </div>
      )}
    </div>
  )
}

function InfoRow({ label, value, children }) {
  return (
    <div style={S.row}>
      <div style={S.label}>{label}</div>
      <div style={S.value}>{children ?? (value ?? '—')}</div>
    </div>
  )
}

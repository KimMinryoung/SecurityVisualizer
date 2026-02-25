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

  useEffect(() => {
    setConfirmDelete(false)
    if (selectedNode?.type !== 'device') { setDevice(null); return }
    setLoading(true)
    api.getDevice(selectedNode.data.deviceId)
      .then(setDevice)
      .finally(() => setLoading(false))
  }, [selectedNode])

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
                {assignError && <p style={{ color: '#fc8181', fontSize: '12px', marginTop: 6 }}>{assignError}</p>}
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

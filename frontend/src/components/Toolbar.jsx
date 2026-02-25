import { useState } from 'react'
import { api } from '../api/client.js'
import ScanDialog from './ScanDialog.jsx'

const styles = {
  bar: {
    display: 'flex', alignItems: 'center', gap: '12px',
    padding: '10px 16px', background: '#1a1d27',
    borderBottom: '1px solid #2d3148', flexShrink: 0,
  },
  title: { fontWeight: 700, fontSize: '16px', color: '#7c8cf8', marginRight: 8 },
  btn: {
    padding: '6px 14px', borderRadius: '6px', border: 'none',
    cursor: 'pointer', fontSize: '13px', fontWeight: 500,
  },
  btnPrimary: { background: '#4f5fef', color: '#fff' },
  btnSecondary: { background: '#2d3148', color: '#a0aec0' },
  spacer: { flex: 1 },
  badge: {
    fontSize: '12px', padding: '3px 8px', borderRadius: '12px',
    background: '#2d3148', color: '#a0aec0',
  },
}

export default function Toolbar({ networks, onRefresh }) {
  const [showAddDevice, setShowAddDevice] = useState(false)
  const [showAddNetwork, setShowAddNetwork] = useState(false)
  const [showScan, setShowScan] = useState(false)
  const [deviceForm, setDeviceForm] = useState({ hostname: '', ip_address: '', os: '', device_type: 'workstation', network_id: '' })
  const [networkForm, setNetworkForm] = useState({ name: '', subnet: '', gateway: '', vlan_id: '', description: '' })
  const [error, setError] = useState('')

  async function submitDevice(e) {
    e.preventDefault()
    setError('')
    try {
      await api.createDevice({
        ...deviceForm,
        network_id: parseInt(deviceForm.network_id),
        vlan_id: deviceForm.vlan_id ? parseInt(deviceForm.vlan_id) : undefined,
      })
      setShowAddDevice(false)
      setDeviceForm({ hostname: '', ip_address: '', os: '', device_type: 'workstation', network_id: '' })
      onRefresh()
    } catch (err) {
      setError(err.message)
    }
  }

  async function submitNetwork(e) {
    e.preventDefault()
    setError('')
    try {
      await api.createNetwork({
        ...networkForm,
        vlan_id: networkForm.vlan_id ? parseInt(networkForm.vlan_id) : undefined,
      })
      setShowAddNetwork(false)
      setNetworkForm({ name: '', subnet: '', gateway: '', vlan_id: '', description: '' })
      onRefresh()
    } catch (err) {
      setError(err.message)
    }
  }

  return (
    <>
      <div style={styles.bar}>
        <span style={styles.title}>SecurityVisualizer</span>
        <button style={{ ...styles.btn, ...styles.btnPrimary }} onClick={() => { setShowAddDevice(true); setShowAddNetwork(false); setError('') }}>
          + Add Device
        </button>
        <button style={{ ...styles.btn, ...styles.btnSecondary }} onClick={() => { setShowAddNetwork(true); setShowAddDevice(false); setError('') }}>
          + Add Network
        </button>
        <button style={{ ...styles.btn, background: '#0c4a6e', color: '#7dd3fc' }} onClick={() => setShowScan(true)}>
          🔍 스캔
        </button>
        <div style={styles.spacer} />
        <span style={styles.badge}>{networks.length} networks</span>
      </div>

      {showScan && (
        <ScanDialog
          networks={networks}
          onImport={onRefresh}
          onClose={() => setShowScan(false)}
        />
      )}

      {showAddDevice && (
        <Modal title="Add Device" onClose={() => setShowAddDevice(false)}>
          <form onSubmit={submitDevice}>
            <Field label="Hostname *" value={deviceForm.hostname} onChange={v => setDeviceForm(f => ({ ...f, hostname: v }))} required />
            <Field label="IP Address *" value={deviceForm.ip_address} onChange={v => setDeviceForm(f => ({ ...f, ip_address: v }))} required />
            <Field label="OS" value={deviceForm.os} onChange={v => setDeviceForm(f => ({ ...f, os: v }))} />
            <SelectField
              label="Device Type"
              value={deviceForm.device_type}
              onChange={v => setDeviceForm(f => ({ ...f, device_type: v }))}
              options={['workstation', 'server', 'router', 'switch', 'firewall', 'other']}
            />
            <SelectField
              label="Network *"
              value={deviceForm.network_id}
              onChange={v => setDeviceForm(f => ({ ...f, network_id: v }))}
              options={networks.map(n => ({ value: n.id, label: `${n.name} (${n.subnet})` }))}
              required
            />
            {error && <p style={{ color: '#fc8181', fontSize: '13px', marginTop: 8 }}>{error}</p>}
            <div style={{ display: 'flex', gap: 8, marginTop: 16, justifyContent: 'flex-end' }}>
              <button type="button" style={{ ...styles.btn, ...styles.btnSecondary }} onClick={() => setShowAddDevice(false)}>Cancel</button>
              <button type="submit" style={{ ...styles.btn, ...styles.btnPrimary }}>Create</button>
            </div>
          </form>
        </Modal>
      )}

      {showAddNetwork && (
        <Modal title="Add Network" onClose={() => setShowAddNetwork(false)}>
          <form onSubmit={submitNetwork}>
            <Field label="Name *" value={networkForm.name} onChange={v => setNetworkForm(f => ({ ...f, name: v }))} required />
            <Field label="Subnet (CIDR) *" value={networkForm.subnet} onChange={v => setNetworkForm(f => ({ ...f, subnet: v }))} placeholder="192.168.1.0/24" required />
            <Field label="Gateway" value={networkForm.gateway} onChange={v => setNetworkForm(f => ({ ...f, gateway: v }))} />
            <Field label="VLAN ID" value={networkForm.vlan_id} onChange={v => setNetworkForm(f => ({ ...f, vlan_id: v }))} />
            <Field label="Description" value={networkForm.description} onChange={v => setNetworkForm(f => ({ ...f, description: v }))} />
            {error && <p style={{ color: '#fc8181', fontSize: '13px', marginTop: 8 }}>{error}</p>}
            <div style={{ display: 'flex', gap: 8, marginTop: 16, justifyContent: 'flex-end' }}>
              <button type="button" style={{ ...styles.btn, ...styles.btnSecondary }} onClick={() => setShowAddNetwork(false)}>Cancel</button>
              <button type="submit" style={{ ...styles.btn, ...styles.btnPrimary }}>Create</button>
            </div>
          </form>
        </Modal>
      )}
    </>
  )
}

function Modal({ title, onClose, children }) {
  return (
    <div style={{
      position: 'fixed', inset: 0, background: 'rgba(0,0,0,0.6)',
      display: 'flex', alignItems: 'center', justifyContent: 'center', zIndex: 100,
    }}>
      <div style={{
        background: '#1a1d27', border: '1px solid #2d3148',
        borderRadius: '10px', padding: '24px', width: '400px', maxWidth: '90vw',
      }}>
        <div style={{ display: 'flex', justifyContent: 'space-between', marginBottom: '16px' }}>
          <h2 style={{ fontSize: '16px', fontWeight: 600, color: '#e2e8f0' }}>{title}</h2>
          <button onClick={onClose} style={{ background: 'none', border: 'none', color: '#718096', cursor: 'pointer', fontSize: '18px' }}>×</button>
        </div>
        {children}
      </div>
    </div>
  )
}

function Field({ label, value, onChange, placeholder, required }) {
  return (
    <div style={{ marginBottom: '12px' }}>
      <label style={{ display: 'block', fontSize: '12px', color: '#a0aec0', marginBottom: '4px' }}>{label}</label>
      <input
        style={{
          width: '100%', padding: '8px 10px', background: '#0f1117',
          border: '1px solid #2d3148', borderRadius: '6px', color: '#e2e8f0', fontSize: '14px',
        }}
        value={value}
        onChange={e => onChange(e.target.value)}
        placeholder={placeholder}
        required={required}
      />
    </div>
  )
}

function SelectField({ label, value, onChange, options, required }) {
  return (
    <div style={{ marginBottom: '12px' }}>
      <label style={{ display: 'block', fontSize: '12px', color: '#a0aec0', marginBottom: '4px' }}>{label}</label>
      <select
        style={{
          width: '100%', padding: '8px 10px', background: '#0f1117',
          border: '1px solid #2d3148', borderRadius: '6px', color: '#e2e8f0', fontSize: '14px',
        }}
        value={value}
        onChange={e => onChange(e.target.value)}
        required={required}
      >
        <option value="">Select…</option>
        {options.map(opt =>
          typeof opt === 'string'
            ? <option key={opt} value={opt}>{opt}</option>
            : <option key={opt.value} value={opt.value}>{opt.label}</option>
        )}
      </select>
    </div>
  )
}

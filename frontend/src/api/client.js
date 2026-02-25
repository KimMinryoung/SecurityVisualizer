const BASE = 'http://localhost:8080'

async function req(method, path, body) {
  const opts = {
    method,
    headers: { 'Content-Type': 'application/json' },
  }
  if (body !== undefined) opts.body = JSON.stringify(body)
  const res = await fetch(`${BASE}${path}`, opts)
  if (!res.ok) {
    const text = await res.text()
    throw new Error(`${res.status} ${text}`)
  }
  if (res.status === 204) return null
  return res.json()
}

export const api = {
  // 접속자 IP 자동 감지
  whoami: () => req('GET', '/api/whoami'),

  // Topology
  getTopology: () => req('GET', '/api/topology/'),

  // Networks
  listNetworks: () => req('GET', '/api/networks/'),
  createNetwork: (data) => req('POST', '/api/networks/', data),
  deleteNetwork: (id) => req('DELETE', `/api/networks/${id}`),

  // Devices
  listDevices: () => req('GET', '/api/devices/'),
  getDevice: (id) => req('GET', `/api/devices/${id}`),
  createDevice: (data) => req('POST', '/api/devices/', data),
  deleteDevice: (id) => req('DELETE', `/api/devices/${id}`),

  // Solutions catalog
  listSolutions: () => req('GET', '/api/solutions/'),
  createSolution: (data) => req('POST', '/api/solutions/', data),

  // Network scan
  scanNetwork: (cidr) => req('POST', '/api/scan/', { cidr }),

  // Device ↔ solution assignments
  listDeviceSolutions: (deviceId) => req('GET', `/api/devices/${deviceId}/solutions`),
  assignSolution: (deviceId, data) => req('POST', `/api/devices/${deviceId}/solutions`, data),
  unassignSolution: (deviceId, assignmentId) => req('DELETE', `/api/devices/${deviceId}/solutions/${assignmentId}`),
}

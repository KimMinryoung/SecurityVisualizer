import { useEffect, useRef } from 'react'
import cytoscape from 'cytoscape'

// ── Emoji & color maps ──────────────────────────────────────────────────────

const DEVICE_EMOJI = {
  workstation: '💻',
  server:      '🖥️',
  router:      '🌐',
  switch:      '🔀',
  firewall:    '🔥',
  other:       '📱',
}

const DEVICE_COLORS = {
  workstation: '#4361ee',
  server:      '#2d9e6b',
  router:      '#e09c28',
  switch:      '#7c3aed',
  firewall:    '#dc2626',
  other:       '#64748b',
}

function networkEmoji(name = '') {
  const n = name.toLowerCase()
  if (n.includes('dmz'))                          return '🛡️'
  if (n.includes('mgmt') || n.includes('management')) return '⚙️'
  if (n.includes('corp') || n.includes('lan') || n.includes('office')) return '🏢'
  return '🔗'
}

// ── Cytoscape stylesheet ────────────────────────────────────────────────────

function buildStylesheet() {
  return [
    // 내 PC: 금색 글로우
    {
      selector: 'node[isMyDevice="true"]',
      style: {
        'border-color': '#fbbf24',
        'border-width': 4,
        'shadow-blur': 24,
        'shadow-color': '#fbbf24',
        'shadow-opacity': 0.85,
        'shadow-offset-x': 0,
        'shadow-offset-y': 0,
      },
    },
    {
      selector: 'node[type="internet"]',
      style: {
        'background-color': '#0c4a6e',
        'border-color': '#38bdf8',
        'border-width': 2,
        label: 'data(label)',
        'text-valign': 'center',
        'text-halign': 'center',
        'font-size': '13px',
        color: '#7dd3fc',
        'text-wrap': 'wrap',
        'text-max-width': '90px',
        shape: 'roundrectangle',
        width: 90,
        height: 55,
      },
    },
    {
      selector: 'node[type="network"]',
      style: {
        'background-color': '#1e2235',
        'border-color': '#6366f1',
        'border-width': 2,
        label: 'data(label)',
        'text-valign': 'center',
        'text-halign': 'center',
        'font-size': '12px',
        color: '#a5b4fc',
        'text-wrap': 'wrap',
        'text-max-width': '130px',
        shape: 'roundrectangle',
        width: 130,
        height: 62,
      },
    },
    {
      selector: 'node[type="device"]',
      style: {
        'background-color': 'data(bgColor)',
        'border-width': 0,
        label: 'data(label)',
        'text-valign': 'bottom',
        'text-halign': 'center',
        'font-size': '10px',
        color: '#cbd5e0',
        'text-margin-y': '5px',
        'text-wrap': 'wrap',
        'text-max-width': '90px',
        width: 52,
        height: 52,
        shape: 'ellipse',
      },
    },
    {
      selector: 'node:selected',
      style: {
        'border-color': '#fff',
        'border-width': 3,
        'border-opacity': 1,
      },
    },
    // Internet → network edge: dashed blue
    {
      selector: 'edge[type="internet"]',
      style: {
        width: 2,
        'line-color': '#38bdf8',
        'line-style': 'dashed',
        'line-dash-pattern': [6, 4],
        'curve-style': 'bezier',
        opacity: 0.7,
      },
    },
    // device → network edge: subtle
    {
      selector: 'edge[type="membership"]',
      style: {
        width: 1.5,
        'line-color': '#334155',
        'curve-style': 'bezier',
        opacity: 0.5,
      },
    },
  ]
}

// ── Build Cytoscape elements from topology ──────────────────────────────────

function toElements(topology, myDeviceId) {
  const elements = []

  // --- Internet node (synthetic) ---
  elements.push({
    data: {
      id: 'internet',
      label: '🌐\nInternet',
      type: 'internet',
    },
  })

  // --- Network nodes ---
  for (const node of topology.nodes) {
    if (node.type !== 'network') continue
    const emoji = networkEmoji(node.data?.name)
    elements.push({
      data: {
        ...node.data,
        id: node.id,
        label: `${emoji} ${node.data?.name || node.label}\n${node.data?.subnet || ''}`,
        type: 'network',
      },
    })

    // Internet → network edge (DMZ gets a direct line; others are internal)
    const isDmzOrPublic =
      (node.data?.name || '').toLowerCase().includes('dmz') ||
      (node.data?.subnet || '').startsWith('10.')
    elements.push({
      data: {
        id: `e-internet-${node.id}`,
        source: 'internet',
        target: node.id,
        type: isDmzOrPublic ? 'internet' : 'membership',
      },
    })
  }

  // --- Device nodes ---
  for (const node of topology.nodes) {
    if (node.type !== 'device') continue
    const deviceType = node.data?.device_type || 'other'
    const emoji = DEVICE_EMOJI[deviceType] || '📱'
    const hostname = node.data?.hostname || node.label
    const ip = node.data?.ip_address || ''
    const isMyDevice = myDeviceId && String(node.data?.id) === String(myDeviceId)
    const myBadge = isMyDevice ? '📍 내 PC\n' : ''

    elements.push({
      data: {
        ...node.data,
        id: node.id,              // Cytoscape 식별자 "dev-1" — spread 뒤에 위치해야 덮어씌워짐
        deviceId: node.data?.id,  // 백엔드 정수 id 별도 보존 (API 호출용)
        label: `${myBadge}${emoji}\n${hostname}\n${ip}`,
        type: 'device',
        bgColor: DEVICE_COLORS[deviceType] || '#64748b',
        isMyDevice: isMyDevice ? 'true' : 'false',
      },
    })
  }

  // --- Membership edges (device → network) ---
  for (const edge of topology.edges) {
    elements.push({
      data: {
        id: edge.id,
        source: edge.source,
        target: edge.target,
        type: 'membership',
      },
    })
  }

  return elements
}

// ── Component ───────────────────────────────────────────────────────────────

export default function NetworkGraph({ topology, myDeviceId, onNodeClick }) {
  const containerRef = useRef(null)
  const cyRef = useRef(null)
  const topologyRef = useRef(null)  // topology 변경 여부 추적

  useEffect(() => {
    if (!containerRef.current) return

    const cy = cytoscape({
      container: containerRef.current,
      elements: [],
      style: buildStylesheet(),
      layout: { name: 'preset' },
      userZoomingEnabled: true,
      userPanningEnabled: true,
      minZoom: 0.1,
      maxZoom: 5,
    })

    cy.on('tap', 'node', (evt) => {
      const node = evt.target
      if (node.data('type') === 'internet') { onNodeClick(null); return }
      onNodeClick({
        id: node.id(),
        type: node.data('type'),
        label: node.data('label'),
        data: node.data(),
      })
    })

    cy.on('tap', (evt) => {
      if (evt.target === cy) onNodeClick(null)
    })

    cyRef.current = cy
    return () => { cy.destroy(); cyRef.current = null }
  }, [])

  useEffect(() => {
    const cy = cyRef.current
    if (!cy || !topology) return

    const topologyChanged = topologyRef.current !== topology
    topologyRef.current = topology

    cy.elements().remove()
    cy.add(toElements(topology, myDeviceId))

    // topology가 실제로 바뀐 경우에만 레이아웃 재계산 (내 PC 변경 시 위치 유지)
    if (topologyChanged) {
      cy.layout({
        name: 'cose',
        animate: false,
        nodeRepulsion: () => 14000,
        idealEdgeLength: () => 130,
        edgeElasticity: () => 0.08,
        gravity: 0.2,
        numIter: 800,
        fit: true,
        padding: 50,
      }).run()
    }
  }, [topology, myDeviceId])

  function fit()  { cyRef.current?.fit(undefined, 50) }
  function zoomIn()  { const cy = cyRef.current; cy?.zoom({ level: cy.zoom() * 1.3, renderedPosition: { x: cy.width() / 2, y: cy.height() / 2 } }) }
  function zoomOut() { const cy = cyRef.current; cy?.zoom({ level: cy.zoom() / 1.3, renderedPosition: { x: cy.width() / 2, y: cy.height() / 2 } }) }

  return (
    <div ref={containerRef} style={{ flex: 1, background: '#0f1117', position: 'relative' }}>

      {/* Zoom controls */}
      <div style={{
        position: 'absolute', top: 12, right: 12, display: 'flex', flexDirection: 'column', gap: 4, zIndex: 10,
      }}>
        {[['＋', zoomIn], ['－', zoomOut], ['⤢', fit]].map(([label, fn]) => (
          <button key={label} onClick={fn} style={{
            width: 32, height: 32, background: '#1e2235', border: '1px solid #2d3148',
            borderRadius: 6, color: '#94a3b8', fontSize: label === '⤢' ? 16 : 18,
            cursor: 'pointer', display: 'flex', alignItems: 'center', justifyContent: 'center',
          }}>{label}</button>
        ))}
      </div>

      {/* Legend */}
      <Legend />
    </div>
  )
}

const LEGEND_ITEMS = [
  { emoji: '🌐', label: '인터넷 (Internet)', color: '#38bdf8' },
  { emoji: '🏢', label: '내부 네트워크 (LAN)', color: '#6366f1' },
  { emoji: '🛡️', label: 'DMZ (공개 구간)', color: '#6366f1' },
  { emoji: '⚙️', label: '관리 네트워크', color: '#6366f1' },
  { emoji: '💻', label: 'PC / 워크스테이션', color: '#4361ee' },
  { emoji: '🖥️', label: '서버', color: '#2d9e6b' },
  { emoji: '🌐', label: '라우터 / 게이트웨이', color: '#e09c28' },
  { emoji: '🔥', label: '방화벽 (Firewall)', color: '#dc2626' },
]

function Legend() {
  return (
    <div style={{
      position: 'absolute', bottom: 16, left: 16,
      background: 'rgba(15,17,23,0.88)',
      border: '1px solid #2d3148',
      borderRadius: 10,
      padding: '10px 14px',
      fontSize: 12,
      color: '#94a3b8',
      pointerEvents: 'none',
      zIndex: 10,
      minWidth: 190,
    }}>
      <div style={{ fontWeight: 700, marginBottom: 8, color: '#64748b', fontSize: 10, textTransform: 'uppercase', letterSpacing: '0.08em' }}>
        범례 (Legend)
      </div>
      {LEGEND_ITEMS.map(({ emoji, label }) => (
        <div key={label} style={{ display: 'flex', alignItems: 'center', gap: 7, marginBottom: 4 }}>
          <span style={{ fontSize: 15, lineHeight: 1 }}>{emoji}</span>
          <span style={{ fontSize: 11 }}>{label}</span>
        </div>
      ))}
    </div>
  )
}

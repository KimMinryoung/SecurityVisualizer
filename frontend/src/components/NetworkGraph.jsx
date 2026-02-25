import { useEffect, useRef } from 'react'
import cytoscape from 'cytoscape'

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
  if (n.includes('dmz'))                               return '🛡️'
  if (n.includes('mgmt') || n.includes('management')) return '⚙️'
  if (n.includes('corp') || n.includes('lan') || n.includes('office')) return '🏢'
  return '🔗'
}

function categoryLabel(isMyDevice, role) {
  const parts = []
  if (isMyDevice) parts.push('📍 내 PC')
  if (role)       parts.push(`🔀 ${role}`)
  return parts.join('\n')
}

// ── Stylesheet ───────────────────────────────────────────────────────────────

function buildStylesheet() {
  return [
    // 내 PC 글로우
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
    // Wrapper compound: 투명 + 카테고리 텍스트 위에
    {
      selector: 'node[type="device-wrapper"]',
      style: {
        'background-opacity': 0,
        'border-width': 0,
        label: 'data(categoryLabel)',
        'text-valign': 'top',
        'text-halign': 'center',
        'font-size': '11px',
        color: '#94a3b8',
        'text-wrap': 'wrap',
        'text-max-width': '160px',
        padding: '4px',
        'compound-sizing-wrt-labels': 'include',
      },
    },
    // Internet
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
    // Network
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
    // Device circle: hostname + IP 안에 표시
    {
      selector: 'node[type="device"]',
      style: {
        'background-color': 'data(bgColor)',
        'border-width': 0,
        label: 'data(label)',
        'text-valign': 'center',
        'text-halign': 'center',
        'font-size': '10px',
        color: '#ffffff',
        'text-wrap': 'wrap',
        'text-max-width': '82px',
        width: 90,
        height: 90,
        shape: 'ellipse',
      },
    },
    {
      selector: 'node:selected',
      style: { 'border-color': '#fff', 'border-width': 3 },
    },
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

// ── Element builder ──────────────────────────────────────────────────────────

function toElements(topology, myDeviceId, gatewayRoles) {
  const elements = []

  // Internet (synthetic)
  elements.push({ data: { id: 'internet', label: '🌐\nInternet', type: 'internet' } })

  // Network nodes + internet edges
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
    const isPublic =
      (node.data?.name || '').toLowerCase().includes('dmz') ||
      (node.data?.subnet || '').startsWith('10.')
    elements.push({
      data: {
        id: `e-internet-${node.id}`,
        source: 'internet',
        target: node.id,
        type: isPublic ? 'internet' : 'membership',
      },
    })
  }

  // Device wrapper + device nodes
  for (const node of topology.nodes) {
    if (node.type !== 'device') continue
    const deviceType = node.data?.device_type || 'other'
    const emoji    = DEVICE_EMOJI[deviceType] || '📱'
    const hostname = node.data?.hostname || node.label
    const ip       = node.data?.ip_address || ''
    const isMyDev  = myDeviceId && String(node.data?.id) === String(myDeviceId)
    const role     = gatewayRoles[ip]

    // 투명 wrapper (카테고리 텍스트는 wrapper의 top에 표시)
    elements.push({
      data: {
        id: `wrap-${node.id}`,
        type: 'device-wrapper',
        categoryLabel: categoryLabel(isMyDev, role),
      },
    })

    // 장비 원 (hostname + IP를 원 안에 표시)
    elements.push({
      data: {
        ...node.data,
        id: node.id,
        parent: `wrap-${node.id}`,
        deviceId: node.data?.id,          // 백엔드 정수 id 보존 (API 호출용)
        label: `${emoji}\n${hostname}\n${ip}`,
        type: 'device',
        bgColor: DEVICE_COLORS[deviceType] || '#64748b',
        isMyDevice: isMyDev ? 'true' : 'false',
      },
    })
  }

  // Membership edges (device → network)
  for (const edge of topology.edges) {
    elements.push({
      data: { id: edge.id, source: edge.source, target: edge.target, type: 'membership' },
    })
  }

  return elements
}

// ── Component ────────────────────────────────────────────────────────────────

export default function NetworkGraph({ topology, myDeviceId, gatewayRoles = {}, onNodeClick }) {
  const containerRef = useRef(null)
  const cyRef = useRef(null)
  const topologyRef = useRef(null)

  // Cytoscape 초기화 (한 번만)
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

      // wrapper 클릭 → 자식 device 노드 정보 전달
      if (node.data('type') === 'device-wrapper') {
        const child = node.children().filter('[type="device"]').first()
        if (child.length) {
          onNodeClick({ id: child.id(), type: 'device', label: child.data('label'), data: child.data() })
        }
        return
      }

      onNodeClick({ id: node.id(), type: node.data('type'), label: node.data('label'), data: node.data() })
    })

    cy.on('tap', (evt) => { if (evt.target === cy) onNodeClick(null) })

    cyRef.current = cy
    return () => { cy.destroy(); cyRef.current = null }
  }, [])

  // topology / myDeviceId / gatewayRoles 변경 처리
  useEffect(() => {
    const cy = cyRef.current
    if (!cy || !topology) return

    const topologyChanged = topologyRef.current !== topology
    topologyRef.current = topology

    if (topologyChanged) {
      // 전체 재렌더 + 레이아웃 재계산
      cy.elements().remove()
      cy.add(toElements(topology, myDeviceId, gatewayRoles))
      cy.layout({
        name: 'cose',
        animate: false,
        nodeRepulsion: () => 18000,
        idealEdgeLength: () => 150,
        edgeElasticity: () => 0.08,
        gravity: 0.2,
        numIter: 800,
        fit: true,
        padding: 60,
      }).run()
    } else {
      // myDeviceId / gatewayRoles 변경: 레이아웃 유지 + 레이블만 갱신
      for (const node of topology.nodes) {
        if (node.type !== 'device') continue
        const hostname = node.data?.hostname || ''
        const ip       = node.data?.ip_address || ''
        const isMyDev  = myDeviceId && String(node.data?.id) === String(myDeviceId)
        const role     = gatewayRoles[ip]
        const emoji    = DEVICE_EMOJI[node.data?.device_type || 'other'] || '📱'

        cy.getElementById(node.id)?.data({
          label: `${emoji}\n${hostname}\n${ip}`,
          isMyDevice: isMyDev ? 'true' : 'false',
        })
        cy.getElementById(`wrap-${node.id}`)?.data({
          categoryLabel: categoryLabel(isMyDev, role),
        })
      }
    }
  }, [topology, myDeviceId, gatewayRoles])

  function fit()     { cyRef.current?.fit(undefined, 60) }
  function zoomIn()  { const cy = cyRef.current; cy?.zoom({ level: cy.zoom() * 1.3, renderedPosition: { x: cy.width() / 2, y: cy.height() / 2 } }) }
  function zoomOut() { const cy = cyRef.current; cy?.zoom({ level: cy.zoom() / 1.3, renderedPosition: { x: cy.width() / 2, y: cy.height() / 2 } }) }

  return (
    <div ref={containerRef} style={{ flex: 1, background: '#0f1117', position: 'relative' }}>
      {/* 줌 컨트롤 */}
      <div style={{ position: 'absolute', top: 12, right: 12, display: 'flex', flexDirection: 'column', gap: 4, zIndex: 10 }}>
        {[['＋', zoomIn], ['－', zoomOut], ['⤢', fit]].map(([lbl, fn]) => (
          <button key={lbl} onClick={fn} style={{
            width: 32, height: 32, background: '#1e2235', border: '1px solid #2d3148',
            borderRadius: 6, color: '#94a3b8', fontSize: lbl === '⤢' ? 16 : 18,
            cursor: 'pointer', display: 'flex', alignItems: 'center', justifyContent: 'center',
          }}>{lbl}</button>
        ))}
      </div>
      <Legend />
    </div>
  )
}

// ── Legend ───────────────────────────────────────────────────────────────────

const LEGEND_ITEMS = [
  { emoji: '🌐', label: '인터넷 (Internet)' },
  { emoji: '🏢', label: '내부 네트워크 (LAN)' },
  { emoji: '🛡️', label: 'DMZ (공개 구간)' },
  { emoji: '💻', label: 'PC / 워크스테이션' },
  { emoji: '🖥️', label: '서버' },
  { emoji: '🌐', label: '라우터 / 게이트웨이' },
  { emoji: '🔥', label: '방화벽 (Firewall)' },
  { emoji: '📍', label: '내 PC (자동 감지)' },
  { emoji: '🔀', label: '기본 게이트웨이' },
]

function Legend() {
  return (
    <div style={{
      position: 'absolute', bottom: 16, left: 16,
      background: 'rgba(15,17,23,0.88)', border: '1px solid #2d3148',
      borderRadius: 10, padding: '10px 14px', fontSize: 12,
      color: '#94a3b8', pointerEvents: 'none', zIndex: 10, minWidth: 190,
    }}>
      <div style={{ fontWeight: 700, marginBottom: 8, color: '#64748b', fontSize: 10, textTransform: 'uppercase', letterSpacing: '0.08em' }}>
        범례 (Legend)
      </div>
      {LEGEND_ITEMS.map(({ emoji, label }) => (
        <div key={label} style={{ display: 'flex', alignItems: 'center', gap: 7, marginBottom: 4 }}>
          <span style={{ fontSize: 14, lineHeight: 1 }}>{emoji}</span>
          <span style={{ fontSize: 11 }}>{label}</span>
        </div>
      ))}
    </div>
  )
}

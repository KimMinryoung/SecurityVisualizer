import { useEffect, useRef } from 'react'
import cytoscape from 'cytoscape'
import coseBilkent from 'cytoscape-cose-bilkent'

cytoscape.use(coseBilkent)

const DEVICE_EMOJI = {
  workstation: '💻',
  server:      '🖥️',
  router:      '🌐',
  switch:      '🔀',
  firewall:    '🔥',
  other:       '📱',
  bt_audio:    '🎧',
  bt_input:    '🖱️',
  bt_other:    '📶',
}

const DEVICE_COLORS = {
  workstation: '#4361ee',
  server:      '#2d9e6b',
  router:      '#e09c28',
  switch:      '#7c3aed',
  firewall:    '#dc2626',
  other:       '#64748b',
  bt_audio:    '#818cf8',
  bt_input:    '#818cf8',
  bt_other:    '#818cf8',
}

const REQUIRED_TYPES = ['antivirus', 'EDR', 'firewall']
const COVERAGE_COLORS = { full: '#16a34a', partial: '#ca8a04', missing: '#dc2626' }

const SEVERITY_ORDER = ['critical', 'high', 'medium', 'low']
const VULN_COLORS = { critical: '#dc2626', high: '#ea580c', medium: '#d97706', low: '#65a30d' }

function worstSeverity(vulns = []) {
  const open = vulns.filter(v => v.status === 'open')
  for (const s of SEVERITY_ORDER) {
    if (open.some(v => v.severity === s)) return s
  }
  return null
}

function coverageStatus(solutions = []) {
  if (!solutions.length) return 'missing'
  const active = solutions.filter(s => s.status === 'active')
  return REQUIRED_TYPES.every(t => active.some(s => s.type === t)) ? 'full' : 'partial'
}

// IP가 CIDR 범위 안에 있는지 확인
function ipInCidr(ip, cidr) {
  try {
    const [net, bits] = cidr.split('/')
    const prefix = parseInt(bits)
    if (isNaN(prefix)) return false
    const mask = prefix === 0 ? 0 : (~0 << (32 - prefix)) >>> 0
    const toInt = s => s.split('.').reduce((a, o) => ((a << 8) | parseInt(o, 10)) >>> 0, 0)
    return (toInt(ip) & mask) === (toInt(net) & mask)
  } catch {
    return false
  }
}

function networkEmoji(name = '') {
  const n = name.toLowerCase()
  if (n.includes('bluetooth'))                          return '📶'
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
        'text-max-width': '200px',
        shape: 'roundrectangle',
        width: 200,
        height: 72,
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
    {
      selector: 'edge[type="membership-offline"]',
      style: {
        width: 1.5,
        'line-color': '#475569',
        'line-style': 'dashed',
        'line-dash-pattern': [5, 5],
        'curve-style': 'bezier',
        opacity: 0.25,
      },
    },
    // 게이트웨이 → 인터넷 라우팅 경로
    {
      selector: 'edge[type="gateway"]',
      style: {
        width: 2.5,
        'line-color': '#f59e0b',
        'curve-style': 'bezier',
        'target-arrow-shape': 'triangle',
        'target-arrow-color': '#f59e0b',
        'arrow-scale': 1.2,
        opacity: 0.85,
      },
    },
    // 블루투스 연결 (활성)
    {
      selector: 'edge[type="bluetooth"]',
      style: {
        width: 2,
        'line-color': '#818cf8',
        'curve-style': 'bezier',
        opacity: 0.85,
      },
    },
    // 블루투스 비활성 (페어링만 된 상태)
    {
      selector: 'edge[type="bluetooth-inactive"]',
      style: {
        width: 1.5,
        'line-color': '#818cf8',
        'line-style': 'dashed',
        'line-dash-pattern': [4, 3],
        'curve-style': 'bezier',
        opacity: 0.4,
      },
    },
  ]
}

// ── Element builder ──────────────────────────────────────────────────────────

function toElements(topology, myDeviceId, gatewayRoles, coverageMode, vulnMode, activeCidrs = []) {
  const elements = []

  // Internet (synthetic)
  elements.push({ data: { id: 'internet', label: '🌐\nInternet', type: 'internet' } })

  // 게이트웨이 IP 목록 (나중에 라우팅 엣지 생성용)
  const gwIps = new Set(Object.keys(gatewayRoles))
  const registeredDeviceIps = new Set(
    topology.nodes.filter(n => n.type === 'device').map(n => n.data?.ip_address)
  )

  // Network nodes + internet edges
  for (const node of topology.nodes) {
    if (node.type !== 'network') continue
    const emoji = networkEmoji(node.data?.name)
    const isBtNet = (node.data?.subnet || '') === 'bluetooth'
    const netDesc = isBtNet ? '(이 PC에 페어링된 장치들)' : '(같은 공유기에 연결된 장치들)'
    elements.push({
      data: {
        ...node.data,
        id: node.id,
        label: `${emoji} ${node.data?.name || node.label}\n${isBtNet ? '' : (node.data?.subnet || '')}\n${netDesc}`,
        type: 'network',
      },
    })
    // 이 네트워크 서브넷에 해당하는 게이트웨이가 있으면 직접 연결 생략
    const subnet = node.data?.subnet || ''
    const hasGwForSubnet = [...gwIps].some(ip => subnet && ipInCidr(ip, subnet))
    if (!hasGwForSubnet) {
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
  }

  // 미등록 게이트웨이 → 가상 노드 생성 + 인터넷 엣지
  for (const [gwIp, role] of Object.entries(gatewayRoles)) {
    if (registeredDeviceIps.has(gwIp)) continue  // 등록된 장비면 스킵
    const synId = `syn-gw-${gwIp.replace(/\./g, '-')}`
    elements.push({
      data: { id: `wrap-${synId}`, type: 'device-wrapper', categoryLabel: `🔀 ${role}` },
    })
    elements.push({
      data: {
        id: synId, parent: `wrap-${synId}`,
        label: `🌐\n게이트웨이\n${gwIp}`,
        type: 'device', bgColor: '#e09c28', isMyDevice: 'false',
      },
    })
    elements.push({
      data: { id: `e-gw-${synId}`, source: synId, target: 'internet', type: 'gateway' },
    })
    // 해당 서브넷 네트워크에 연결
    for (const netNode of topology.nodes) {
      if (netNode.type !== 'network') continue
      if (netNode.data?.subnet && ipInCidr(gwIp, netNode.data.subnet)) {
        elements.push({
          data: { id: `e-syn-${synId}-${netNode.id}`, source: synId, target: netNode.id, type: 'membership' },
        })
      }
    }
  }

  // Device wrapper + device nodes
  for (const node of topology.nodes) {
    if (node.type !== 'device') continue
    const deviceType = node.data?.device_type || 'other'
    const solutions  = node.data?.solutions || []
    const vulns      = node.data?.vulnerabilities || []
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

    // 장비 원 (hostname + IP를 원 안에 표시, BT 장비는 MAC 표시)
    const isBt = ip.startsWith('bt:')
    const displayLine3 = isBt ? (node.data?.mac_address || 'Bluetooth') : ip
    elements.push({
      data: {
        ...node.data,
        id: node.id,
        parent: `wrap-${node.id}`,
        deviceId: node.data?.id,          // 백엔드 정수 id 보존 (API 호출용)
        label: `${emoji}\n${hostname}\n${displayLine3}`,
        type: 'device',
        bgColor: coverageMode
          ? COVERAGE_COLORS[coverageStatus(solutions)]
          : vulnMode
            ? (VULN_COLORS[worstSeverity(vulns)] ?? DEVICE_COLORS[deviceType] ?? '#64748b')
            : DEVICE_COLORS[deviceType] ?? '#64748b',
        vulnerabilities: vulns,
        isMyDevice: isMyDev ? 'true' : 'false',
      },
    })
  }

  // Membership edges (device → network) — activeCidrs 기반으로 온/오프라인 구분
  for (const edge of topology.edges) {
    const devNode = topology.nodes.find(n => n.id === edge.source && n.type === 'device')
    const ip = devNode?.data?.ip_address || ''
    const online = activeCidrs.length === 0 || activeCidrs.some(c => ipInCidr(ip, c))
    elements.push({
      data: { id: edge.id, source: edge.source, target: edge.target, type: online ? 'membership' : 'membership-offline' },
    })
  }

  // 게이트웨이 장비 → 인터넷 라우팅 엣지
  for (const node of topology.nodes) {
    if (node.type !== 'device') continue
    const ip = node.data?.ip_address || ''
    if (gwIps.has(ip)) {
      elements.push({
        data: {
          id: `e-gw-${node.id}`,
          source: node.id,
          target: 'internet',
          type: 'gateway',
        },
      })
    }
  }

  // 블루투스 장비 → 내 PC 연결 엣지
  if (myDeviceId) {
    const myNode = topology.nodes.find(
      n => n.type === 'device' && String(n.data?.id) === String(myDeviceId)
    )
    if (myNode) {
      for (const node of topology.nodes) {
        if (node.type !== 'device') continue
        const ip = node.data?.ip_address || ''
        if (ip.startsWith('bt:')) {
          const active = node.data?.status === 'active'
          elements.push({
            data: {
              id: `e-bt-${node.id}`,
              source: node.id,
              target: myNode.id,
              type: active ? 'bluetooth' : 'bluetooth-inactive',
            },
          })
        }
      }
    }
  }

  return elements
}

// ── Component ────────────────────────────────────────────────────────────────

export default function NetworkGraph({ topology, myDeviceId, gatewayRoles = {}, activeCidrs = [], onNodeClick, coverageMode = false, filterTypes = new Set(), vulnMode = false, vulnSeverityFilter = new Set() }) {
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

  // topology / myDeviceId / gatewayRoles / activeCidrs 변경 처리
  useEffect(() => {
    const cy = cyRef.current
    if (!cy || !topology) return

    const topologyChanged = topologyRef.current !== topology
    topologyRef.current = topology

    if (topologyChanged) {
      // 전체 재렌더 + 레이아웃 재계산
      cy.elements().remove()
      cy.add(toElements(topology, myDeviceId, gatewayRoles, coverageMode, vulnMode, activeCidrs))
      cy.layout({
        name: 'cose-bilkent',
        animate: false,
        nodeRepulsion: 8000,
        idealEdgeLength: 100,
        edgeElasticity: 0.45,
        gravity: 1.0,
        gravityRange: 2.0,
        numIter: 2500,
        nestingFactor: 0.1,
        nodeDimensionsIncludeLabels: true,
        fit: true,
        padding: 40,
        tile: true,
        tilingPaddingVertical: 20,
        tilingPaddingHorizontal: 20,
      }).run()
    } else {
      // 레이아웃 유지 — 엣지 온/오프라인 타입 갱신
      for (const edge of topology.edges) {
        const devNode = topology.nodes.find(n => n.id === edge.source && n.type === 'device')
        const ip = devNode?.data?.ip_address || ''
        const online = activeCidrs.length === 0 || activeCidrs.some(c => ipInCidr(ip, c))
        cy.getElementById(edge.id)?.data('type', online ? 'membership' : 'membership-offline')
      }
      // 레이블 갱신 (myDeviceId / gatewayRoles 변경 대응)
      for (const node of topology.nodes) {
        if (node.type !== 'device') continue
        const hostname = node.data?.hostname || ''
        const ip       = node.data?.ip_address || ''
        const isMyDev  = myDeviceId && String(node.data?.id) === String(myDeviceId)
        const role     = gatewayRoles[ip]
        const emoji    = DEVICE_EMOJI[node.data?.device_type || 'other'] || '📱'
        const isBt     = ip.startsWith('bt:')
        const line3    = isBt ? (node.data?.mac_address || 'Bluetooth') : ip

        cy.getElementById(node.id)?.data({
          label: `${emoji}\n${hostname}\n${line3}`,
          isMyDevice: isMyDev ? 'true' : 'false',
        })
        cy.getElementById(`wrap-${node.id}`)?.data({
          categoryLabel: categoryLabel(isMyDev, role),
        })
      }
    }
  }, [topology, myDeviceId, gatewayRoles, activeCidrs])

  // 색상 + dim 필터 (coverageMode, filterTypes, vulnMode, vulnSeverityFilter, topology 변경 시)
  useEffect(() => {
    const cy = cyRef.current
    if (!cy || !topology) return
    for (const node of topology.nodes) {
      if (node.type !== 'device') continue
      const solutions  = node.data?.solutions || []
      const vulns      = node.data?.vulnerabilities || []
      const deviceType = node.data?.device_type || 'other'
      cy.getElementById(node.id)?.data({
        bgColor: coverageMode
          ? COVERAGE_COLORS[coverageStatus(solutions)]
          : vulnMode
            ? (VULN_COLORS[worstSeverity(vulns)] ?? DEVICE_COLORS[deviceType] ?? '#64748b')
            : DEVICE_COLORS[deviceType] ?? '#64748b',
      })
      const wrap = cy.getElementById(`wrap-${node.id}`)
      if (coverageMode && filterTypes.size > 0) {
        const activeTypes = new Set(solutions.filter(s => s.status === 'active').map(s => s.type))
        const lacking = [...filterTypes].some(t => !activeTypes.has(t))
        wrap?.style('opacity', lacking ? 1 : 0.15)
      } else if (vulnMode && vulnSeverityFilter.size > 0) {
        const openSeverities = new Set(vulns.filter(v => v.status === 'open').map(v => v.severity))
        const matches = [...vulnSeverityFilter].some(s => openSeverities.has(s))
        wrap?.style('opacity', matches ? 1 : 0.15)
      } else {
        wrap?.style('opacity', 1)
      }
    }
  }, [coverageMode, filterTypes, vulnMode, vulnSeverityFilter, topology])

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
      <Legend coverageMode={coverageMode} vulnMode={vulnMode} />
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
  { emoji: '🎧', label: '블루투스 장치' },
]

const COVERAGE_LEGEND = [
  { dot: COVERAGE_COLORS.full,    label: '완전 커버 (AV+EDR+FW)' },
  { dot: COVERAGE_COLORS.partial, label: '일부 누락' },
  { dot: COVERAGE_COLORS.missing, label: '솔루션 없음' },
]

const VULN_LEGEND = [
  { dot: VULN_COLORS.critical, label: 'Critical' },
  { dot: VULN_COLORS.high,     label: 'High' },
  { dot: VULN_COLORS.medium,   label: 'Medium' },
  { dot: VULN_COLORS.low,      label: 'Low' },
]

function Legend({ coverageMode, vulnMode }) {
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
      <div style={{ display: 'flex', alignItems: 'center', gap: 7, marginBottom: 4 }}>
        <svg width="28" height="8" style={{ flexShrink: 0 }}>
          <line x1="0" y1="4" x2="22" y2="4" stroke="#f59e0b" strokeWidth="2.5" />
          <polygon points="22,0 28,4 22,8" fill="#f59e0b" />
        </svg>
        <span style={{ fontSize: 11 }}>인터넷 경로 (게이트웨이 경유)</span>
      </div>
      <div style={{ display: 'flex', alignItems: 'center', gap: 7, marginBottom: 4 }}>
        <svg width="28" height="8" style={{ flexShrink: 0 }}>
          <line x1="0" y1="4" x2="28" y2="4" stroke="#818cf8" strokeWidth="2" />
        </svg>
        <span style={{ fontSize: 11 }}>블루투스 연결 (활성)</span>
      </div>
      <div style={{ display: 'flex', alignItems: 'center', gap: 7, marginBottom: 4 }}>
        <svg width="28" height="8" style={{ flexShrink: 0 }}>
          <line x1="0" y1="4" x2="28" y2="4" stroke="#818cf8" strokeWidth="1.5" strokeDasharray="4,3" />
        </svg>
        <span style={{ fontSize: 11 }}>블루투스 (비활성)</span>
      </div>
      <div style={{ display: 'flex', alignItems: 'center', gap: 7, marginBottom: 8, paddingBottom: 8, borderBottom: '1px solid #1e2235' }}>
        <svg width="28" height="8" style={{ flexShrink: 0 }}>
          <line x1="0" y1="4" x2="28" y2="4" stroke="#475569" strokeWidth="1.5" strokeDasharray="5,5" />
        </svg>
        <span style={{ fontSize: 11 }}>미연결 (현재 서브넷 외)</span>
      </div>
      {coverageMode ? (
        COVERAGE_LEGEND.map(({ dot, label }) => (
          <div key={label} style={{ display: 'flex', alignItems: 'center', gap: 7, marginBottom: 4 }}>
            <span style={{ width: 12, height: 12, borderRadius: '50%', background: dot, display: 'inline-block', flexShrink: 0 }} />
            <span style={{ fontSize: 11 }}>{label}</span>
          </div>
        ))
      ) : vulnMode ? (
        VULN_LEGEND.map(({ dot, label }) => (
          <div key={label} style={{ display: 'flex', alignItems: 'center', gap: 7, marginBottom: 4 }}>
            <span style={{ width: 12, height: 12, borderRadius: '50%', background: dot, display: 'inline-block', flexShrink: 0 }} />
            <span style={{ fontSize: 11 }}>{label}</span>
          </div>
        ))
      ) : (
        LEGEND_ITEMS.map(({ emoji, label }) => (
          <div key={label} style={{ display: 'flex', alignItems: 'center', gap: 7, marginBottom: 4 }}>
            <span style={{ fontSize: 14, lineHeight: 1 }}>{emoji}</span>
            <span style={{ fontSize: 11 }}>{label}</span>
          </div>
        ))
      )}
    </div>
  )
}

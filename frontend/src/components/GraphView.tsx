import { useEffect, useRef, useState } from 'react'
import cytoscape, { Core } from 'cytoscape'
import {
  Compass,
  Maximize2,
  Minimize2,
  RefreshCw,
  Search,
  ZoomIn,
  ZoomOut,
  Layers,
  Sparkles
} from 'lucide-react'
import type { GraphEdge, GraphNode } from '../types/investigation'

function nodeColor(layer: number, risk: number, hop: number) {
  if (hop === 0) return '#0ea5e9' // Sky Blue for victim
  if (layer === 3 || risk >= 75) return '#ef4444' // Critical Red
  if (layer === 2 || risk >= 50) return '#f59e0b' // Amber Orange
  if (layer === 1 || risk >= 25) return '#8b5cf6' // Purple
  return '#10b981' // Emerald Green
}

export type LayoutType = 'cose' | 'breadthfirst' | 'concentric' | 'circle'

export default function GraphView({
  nodes,
  edges,
  selectedId,
  onSelect,
}: {
  nodes: GraphNode[]
  edges: GraphEdge[]
  selectedId?: string
  onSelect?: (node: GraphNode | null) => void
}) {
  const containerRef = useRef<HTMLDivElement | null>(null)
  const cyRef = useRef<Core | null>(null)
  const onSelectRef = useRef(onSelect)
  const nodesRef = useRef(nodes)
  
  const [layoutName, setLayoutName] = useState<LayoutType>('cose')
  const [nodeSearch, setNodeSearch] = useState('')
  const [isFullscreen, setIsFullscreen] = useState(false)

  onSelectRef.current = onSelect
  nodesRef.current = nodes

  // Initialize Cytoscape once
  useEffect(() => {
    if (!containerRef.current) return

    const cy = cytoscape({
      container: containerRef.current,
      elements: [],
      style: [
        {
          selector: 'node',
          style: {
            'background-color': 'data(color)',
            width: 44,
            height: 44,
            label: 'data(label)',
            color: '#0f172a',
            'font-size': '9px',
            'font-weight': 700,
            'text-wrap': 'wrap',
            'text-valign': 'bottom',
            'text-margin-y': 5,
            'border-width': 3,
            'border-color': '#ffffff',
            'text-background-color': 'rgba(255, 255, 255, 0.95)',
            'text-background-opacity': 1,
            'text-background-padding': '3px',
            'text-background-shape': 'roundrectangle',
            'overlay-opacity': 0,
            'transition-property': 'background-color, border-width, border-color, opacity',
            'transition-duration': 200,
          },
        },
        {
          selector: 'node:selected',
          style: {
            'border-width': 4,
            'border-color': '#10b981',
            'border-opacity': 1,
            'underlay-color': '#10b981',
            'underlay-padding': 6,
            'underlay-opacity': 0.25,
          },
        },
        {
          selector: 'node.highlighted',
          style: {
            'border-width': 4,
            'border-color': '#059669',
            'border-opacity': 1,
            'underlay-color': '#10b981',
            'underlay-padding': 6,
            'underlay-opacity': 0.3,
          },
        },
        {
          selector: 'node.dimmed',
          style: {
            opacity: 0.2,
          },
        },
        {
          selector: 'edge',
          style: {
            width: 2,
            'line-color': '#94a3b8',
            'target-arrow-color': '#64748b',
            'target-arrow-shape': 'triangle',
            'curve-style': 'bezier',
            'arrow-scale': 0.8,
            label: 'data(label)',
            color: '#475569',
            'font-size': '8px',
            'font-weight': 600,
            'text-background-color': '#ffffff',
            'text-background-opacity': 0.95,
            'text-background-padding': '2px',
            'text-background-shape': 'roundrectangle',
            'transition-property': 'line-color, target-arrow-color, width, opacity',
            'transition-duration': 200,
          },
        },
        {
          selector: 'edge.highlighted',
          style: {
            width: 3.5,
            'line-color': '#10b981',
            'target-arrow-color': '#10b981',
            color: '#059669',
            'z-index': 99,
          },
        },
        {
          selector: 'edge.dimmed',
          style: {
            opacity: 0.15,
          },
        },
      ],
      wheelSensitivity: 0.35,
    })

    cy.on('tap', 'node', (event) => {
      const id = event.target.id()
      const found = nodesRef.current.find((n) => n.id === id) || null
      onSelectRef.current?.(found)
    })

    cy.on('tap', (event) => {
      if (event.target === cy) {
        onSelectRef.current?.(null)
      }
    })

    cyRef.current = cy

    return () => {
      cy.destroy()
      cyRef.current = null
    }
  }, [])

  // Update elements and apply layout
  useEffect(() => {
    const cy = cyRef.current
    if (!cy) return

    const nodeIds = new Set(nodes.map((n) => n.id))
    const safeEdges = edges.filter((e) => nodeIds.has(e.sender_account) && nodeIds.has(e.receiver_account))

    cy.elements().remove()

    cy.add([
      ...nodes.map((n) => ({
        data: {
          id: n.id,
          label: n.hop === 0 ? 'VICTIM\n' + n.account : `L${n.layer} • ${n.account}\nRisk ${n.risk_score}`,
          color: nodeColor(n.layer, n.risk_score, n.hop),
          risk: n.risk_score,
          hop: n.hop,
        },
      })),
      ...safeEdges.map((e) => ({
        data: {
          id: e.transaction_id,
          source: e.sender_account,
          target: e.receiver_account,
          label: `₹${Number(e.amount).toLocaleString('en-IN')}`,
        },
      })),
    ])

    applyLayout(layoutName)

    if (selectedId) {
      cy.nodes().unselect()
      cy.$id(selectedId).select()
    }
  }, [nodes, edges])

  // Handle selectedId prop changes & highlight connected paths
  useEffect(() => {
    const cy = cyRef.current
    if (!cy) return

    cy.elements().removeClass('highlighted dimmed')
    cy.nodes().unselect()

    if (selectedId) {
      const targetNode = cy.$id(selectedId)
      if (targetNode.length > 0) {
        targetNode.select()
        const connectedEdges = targetNode.connectedEdges()
        const connectedNodes = connectedEdges.connectedNodes()

        cy.elements().addClass('dimmed')
        targetNode.removeClass('dimmed').addClass('highlighted')
        connectedNodes.removeClass('dimmed').addClass('highlighted')
        connectedEdges.removeClass('dimmed').addClass('highlighted')
      }
    }
  }, [selectedId])

  const applyLayout = (name: LayoutType) => {
    const cy = cyRef.current
    if (!cy) return

    const layoutConfig: any = {
      name,
      animate: true,
      animationDuration: 400,
      padding: 45,
    }

    if (name === 'breadthfirst') {
      layoutConfig.directed = true
      layoutConfig.spacingFactor = 1.3
      layoutConfig.roots = cy.nodes().filter((n: any) => n.data('hop') === 0)
    } else if (name === 'concentric') {
      layoutConfig.concentric = (node: any) => 5 - (node.data('hop') || 0)
      layoutConfig.levelWidth = () => 1
    } else if (name === 'cose') {
      layoutConfig.idealEdgeLength = 100
      layoutConfig.nodeRepulsion = 450000
    }

    cy.layout(layoutConfig).run()
  }

  const handleLayoutChange = (newLayout: LayoutType) => {
    setLayoutName(newLayout)
    applyLayout(newLayout)
  }

  const handleZoom = (factor: number) => {
    const cy = cyRef.current
    if (!cy) return
    cy.zoom({
      level: cy.zoom() * factor,
      renderedPosition: { x: cy.width() / 2, y: cy.height() / 2 },
    })
  }

  const handleFit = () => {
    const cy = cyRef.current
    if (!cy) return
    cy.fit(undefined, 35)
  }

  const handleSearchNode = (e: React.FormEvent) => {
    e.preventDefault()
    const cy = cyRef.current
    if (!cy || !nodeSearch.trim()) return

    const query = nodeSearch.trim().toLowerCase()
    const matched = cy.nodes().filter((n: any) => n.id().toLowerCase().includes(query))

    if (matched.length > 0) {
      const target = matched[0]
      const found = nodesRef.current.find((n) => n.id === target.id()) || null
      onSelectRef.current?.(found)
      cy.animate({
        center: { eles: target },
        zoom: 1.6,
        duration: 400,
      })
    }
  }

  return (
    <div className={`graph-container ${isFullscreen ? 'fullscreen-graph' : ''}`}>
      {/* Floating Modern Toolbar */}
      <div className="graph-controls-bar">
        {/* Layout Switcher */}
        <div className="layout-pills">
          <button
            className={`ctrl-btn ${layoutName === 'cose' ? 'active' : ''}`}
            onClick={() => handleLayoutChange('cose')}
            title="Force-Directed Cluster Layout"
          >
            <Compass size={13} />
            <span>Force Cluster</span>
          </button>
          <button
            className={`ctrl-btn ${layoutName === 'breadthfirst' ? 'active' : ''}`}
            onClick={() => handleLayoutChange('breadthfirst')}
            title="Hierarchical Flow Tree (BFS)"
          >
            <Layers size={13} />
            <span>BFS Tree</span>
          </button>
          <button
            className={`ctrl-btn ${layoutName === 'concentric' ? 'active' : ''}`}
            onClick={() => handleLayoutChange('concentric')}
            title="Concentric Radar View"
          >
            <Sparkles size={13} />
            <span>Radar Circles</span>
          </button>
        </div>

        {/* In-Graph Node Search */}
        <form onSubmit={handleSearchNode} className="graph-mini-search">
          <Search size={12} />
          <input
            type="text"
            placeholder="Find node in graph..."
            value={nodeSearch}
            onChange={(e) => setNodeSearch(e.target.value)}
          />
        </form>

        {/* Canvas Actions */}
        <div className="graph-action-btns">
          <button className="ctrl-icon-btn" onClick={() => handleZoom(1.25)} title="Zoom In">
            <ZoomIn size={14} />
          </button>
          <button className="ctrl-icon-btn" onClick={() => handleZoom(0.8)} title="Zoom Out">
            <ZoomOut size={14} />
          </button>
          <button className="ctrl-icon-btn" onClick={handleFit} title="Center & Fit">
            <RefreshCw size={14} />
          </button>
          <button
            className="ctrl-icon-btn"
            onClick={() => setIsFullscreen(!isFullscreen)}
            title={isFullscreen ? 'Exit Fullscreen' : 'Fullscreen Graph'}
          >
            {isFullscreen ? <Minimize2 size={14} /> : <Maximize2 size={14} />}
          </button>
        </div>
      </div>

      <div ref={containerRef} className="graph-canvas" />
    </div>
  )
}

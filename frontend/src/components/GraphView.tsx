import { useEffect, useRef } from 'react'
import cytoscape from 'cytoscape'
import type { GraphEdge, GraphNode } from '../types/investigation'

function nodeColor(layer: number, risk: number, hop: number) {
  if (hop === 0) return '#5ee7ff'
  if (layer === 3 || risk >= 75) return '#cf2a46'
  if (layer === 2 || risk >= 50) return '#ffb454'
  if (layer === 1 || risk >= 25) return '#8b9cff'
  return '#6f7d98'
}

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
  const ref = useRef<HTMLDivElement | null>(null)

  useEffect(() => {
    if (!ref.current) return
    const cy = cytoscape({
      container: ref.current,
      elements: [
        ...nodes.map((n) => ({
          data: {
            id: n.id,
            label: n.hop === 0 ? 'VICTIM\n' + n.account : `L${n.layer} • ${n.account}\nRisk ${n.risk_score}`,
            color: nodeColor(n.layer, n.risk_score, n.hop),
            risk: n.risk_score,
            hop: n.hop,
          },
        })),
        ...edges.map((e) => ({
          data: {
            id: e.transaction_id,
            source: e.sender_account,
            target: e.receiver_account,
            label: `₹${Number(e.amount).toLocaleString('en-IN')}`,
          },
        })),
      ],
      style: [
        {
          selector: 'node',
          style: {
            'background-color': 'data(color)',
            width: 42,
            height: 42,
            label: 'data(label)',
            color: '#dbe7ff',
            'font-size': '8px',
            'font-weight': 700,
            'text-wrap': 'wrap',
            'text-max-width': '110px',
            'text-valign': 'bottom',
            'text-margin-y': 8,
            'border-width': 2,
            'border-color': '#182238',
          },
        },
        {
          selector: 'node:selected',
          style: {
            'border-width': 4,
            'border-color': '#ffffff',
            'overlay-opacity': 0,
          },
        },
        {
          selector: 'edge',
          style: {
            width: 2,
            'line-color': '#425170',
            'target-arrow-color': '#60739c',
            'target-arrow-shape': 'triangle',
            'curve-style': 'bezier',
            'arrow-scale': 0.7,
            label: 'data(label)',
            color: '#7182a6',
            'font-size': '7px',
            'text-background-color': '#080d18',
            'text-background-opacity': 0.9,
            'text-background-padding': 2,
          },
        },
      ],
      layout: { name: 'cose', animate: false, padding: 50, idealEdgeLength: 90 },
      wheelSensitivity: 0.22,
    })

    cy.on('tap', 'node', (event) => {
      const id = event.target.id()
      onSelect?.(nodes.find((n) => n.id === id) || null)
    })

    if (selectedId) cy.$id(selectedId).select()

    return () => cy.destroy()
  }, [nodes, edges, selectedId, onSelect])

  return <div ref={ref} className="graph-canvas" />
}

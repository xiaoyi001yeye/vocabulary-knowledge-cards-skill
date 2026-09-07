import type { GraphData } from '@antv/g6';
import type { LessonBundle, SchemaEdge, SchemaNode } from '../data/schema-types';

const nodeVisuals: Record<SchemaNode['type'], { fill: string; stroke: string; glow: string; size: number; labelColor: string }> = {
  lesson: { fill: '#5842c8', stroke: '#c8c1ff', glow: 'rgba(88, 66, 200, 0.38)', size: 92, labelColor: '#ffffff' },
  knowledge: { fill: '#0f9195', stroke: '#9ae8e4', glow: 'rgba(15, 145, 149, 0.30)', size: 66, labelColor: '#163c43' },
  word: { fill: '#f08a4b', stroke: '#ffe0ce', glow: 'rgba(240, 138, 75, 0.30)', size: 48, labelColor: '#2b3345' },
};

function nodeStyle(node: SchemaNode) {
  const visual = nodeVisuals[node.type];
  const isLesson = node.type === 'lesson';
  return {
    size: visual.size,
    fill: visual.fill,
    fillOpacity: 0.98,
    stroke: visual.stroke,
    lineWidth: isLesson ? 5 : 3,
    shadowColor: visual.glow,
    shadowBlur: isLesson ? 22 : 14,
    shadowOffsetY: 5,
    labelText: node.type === 'word' ? node.id : node.label,
    labelFill: visual.labelColor,
    labelFontWeight: isLesson ? 800 : 700,
    labelFontSize: isLesson ? 18 : node.type === 'knowledge' ? 14 : 13,
    labelPlacement: isLesson ? ('center' as const) : ('bottom' as const),
    labelOffsetY: isLesson ? 0 : 10,
    labelBackground: !isLesson,
    labelBackgroundFill: '#ffffff',
    labelBackgroundFillOpacity: 0.88,
    labelBackgroundRadius: 7,
    labelPadding: [3, 7],
  };
}

function edgeStyle(edge: SchemaEdge) {
  if (edge.type === 'word-family') return { stroke: '#6954d9', strokeOpacity: 0.9, lineWidth: 3.5 };
  if (edge.type === 'lesson-chain') return { stroke: '#e67d43', strokeOpacity: 0.85, lineWidth: 3, lineDash: [8, 6] };
  if (edge.type === 'reviews') return { stroke: '#aab6ca', strokeOpacity: 0.55, lineWidth: 1.5, lineDash: [4, 5] };
  return { stroke: '#bac4d5', strokeOpacity: 0.68, lineWidth: 2 };
}

export function toG6Data(bundle: LessonBundle): GraphData {
  return {
    nodes: bundle.graph.nodes.map((node) => ({
      id: node.id,
      data: node,
      style: nodeStyle(node),
    })),
    edges: bundle.graph.edges.map((edge, index) => ({
      id: edge.source + '-' + edge.target + '-' + index,
      source: edge.source,
      target: edge.target,
      data: edge,
      style: edgeStyle(edge),
    })),
  };
}

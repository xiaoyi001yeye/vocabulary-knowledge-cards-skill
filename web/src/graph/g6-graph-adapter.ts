import { Graph, type GraphData, type State } from '@antv/g6';

type GraphCallbacks = { onSelect: (nodeId: string) => void };

type ResizableGraph = { setSize?: (size: [number, number]) => void };

export class G6GraphAdapter {
  private graph: Graph | null = null;
  private resizeObserver: ResizeObserver | null = null;
  private selectedNodeId: string | null = null;

  async mount(container: HTMLElement, data: GraphData, callbacks: GraphCallbacks): Promise<void> {
    this.destroy();
    const graph = new Graph({
      container,
      data,
      autoFit: 'view',
      animation: true,
      layout: {
        type: 'd3-force',
        center: { strength: 0.08 },
        link: { distance: 150, strength: 0.86 },
        manyBody: { strength: -560, distanceMax: 760 },
        collide: { radius: 50, strength: 0.95, iterations: 3 },
        clustering: true,
        clusterBy: (node) => String((node.data as { group?: string; type?: string }).group ?? (node.data as { type?: string }).type ?? 'default'),
        clusterNodeStrength: -26,
        clusterEdgeDistance: 130,
        alphaDecay: 0.024,
        velocityDecay: 0.32,
      },
      behaviors: [
        'drag-canvas',
        'zoom-canvas',
        'drag-element-force',
        { type: 'click-select', multiple: false, degree: 0, state: 'selected', animation: true },
        { type: 'focus-element', animation: { duration: 600 } },
      ],
      node: {
        type: 'circle',
        state: {
          selected: { lineWidth: 7, stroke: '#172033', shadowBlur: 26, shadowColor: 'rgba(23, 32, 51, 0.3)' },
          hover: { lineWidth: 5, stroke: '#ffffff', shadowBlur: 24 },
        },
      },
      edge: { type: 'line' },
    });
    graph.on('node:click', (event) => {
      const target = (event as unknown as { target?: { id?: string } }).target;
      if (target?.id) {
        this.selectedNodeId = target.id;
        callbacks.onSelect(target.id);
      }
    });
    await graph.render();
    this.graph = graph;
    this.resizeObserver = new ResizeObserver(() => {
      const width = container.clientWidth;
      const height = container.clientHeight;
      (graph as unknown as ResizableGraph).setSize?.([width, height]);
    });
    this.resizeObserver.observe(container);
  }

  async focus(nodeId: string): Promise<void> {
    if (!this.graph) return;
    const states: Record<string, State[]> = { [nodeId]: ['selected'] };
    if (this.selectedNodeId && this.selectedNodeId !== nodeId) states[this.selectedNodeId] = [];
    this.selectedNodeId = nodeId;
    await this.graph.setElementState(states, true);
    // Keep the card update synchronous with selection; the viewport animation can finish independently.
    void this.graph.focusElement(nodeId, { duration: 600 }).catch(() => undefined);
  }

  resetView(): void {
    if (!this.graph) return;
    this.graph.fitView();
  }

  destroy(): void {
    this.resizeObserver?.disconnect();
    this.resizeObserver = null;
    this.graph?.destroy();
    this.graph = null;
    this.selectedNodeId = null;
  }
}

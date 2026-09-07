import type { LessonBundle, SchemaNode, WordCard } from '../data/schema-types';
import { G6GraphAdapter } from '../graph/g6-graph-adapter';
import { toG6Data } from '../graph/to-g6-data';

function element<K extends keyof HTMLElementTagNameMap>(tag: K, className?: string): HTMLElementTagNameMap[K] {
  const node = document.createElement(tag);
  if (className) node.className = className;
  return node;
}

function addSection(panel: HTMLElement, heading: string, text: string) {
  const section = element('section', 'card-section');
  const title = element('h3'); title.textContent = heading;
  const content = element('p'); content.textContent = text;
  section.append(title, content); panel.append(section);
}

export class ExplorerPage {
  private readonly graph = new G6GraphAdapter();
  private readonly cardPanel = element('aside', 'card-panel panel');
  private readonly status = element('p', 'status');
  private readonly input = element('input') as HTMLInputElement;
  private bundle: LessonBundle | null = null;

  async mount(root: HTMLElement, bundle: LessonBundle): Promise<void> {
    this.bundle = bundle;
    root.replaceChildren();
    const shell = element('main', 'app-shell');
    const header = element('header', 'topbar');
    const heading = element('div');
    const eyebrow = element('p', 'eyebrow'); eyebrow.textContent = 'ANTV G6 · VOCABULARY KNOWLEDGE CARDS';
    const h1 = element('h1'); h1.textContent = '背单词知识图谱';
    const summary = element('p', 'subtitle'); summary.textContent = bundle.lesson.summary;
    heading.append(eyebrow, h1, summary);

    const searchBox = element('label', 'search');
    const searchLabel = element('span'); searchLabel.textContent = '定位单词';
    const searchRow = element('div', 'search-row');
    this.input.placeholder = '输入单词，例如 influence';
    this.input.setAttribute('list', 'word-options');
    const datalist = element('datalist') as HTMLDataListElement; datalist.id = 'word-options';
    bundle.words.forEach((word) => { const option = element('option') as HTMLOptionElement; option.value = word.id; option.label = word.meaning; datalist.append(option); });
    const locate = element('button'); locate.type = 'button'; locate.textContent = '定位';
    locate.addEventListener('click', () => void this.searchWord());
    this.input.addEventListener('keydown', (event) => { if (event.key === 'Enter') void this.searchWord(); });
    searchRow.append(this.input, locate); searchBox.append(searchLabel, searchRow, datalist);
    header.append(heading, searchBox);

    const workspace = element('section', 'workspace');
    const graphPanel = element('section', 'graph-panel panel');
    const graphHeading = element('div', 'panel-heading');
    const graphTitleBox = element('div');
    const graphEyebrow = element('p', 'eyebrow'); graphEyebrow.textContent = 'ANTV G6 GRAPH';
    const graphTitle = element('h2'); graphTitle.textContent = '单词 · 知识 · 关系';
    graphTitleBox.append(graphEyebrow, graphTitle);
    const reset = element('button', 'quiet-button'); reset.type = 'button'; reset.textContent = '重置视角'; reset.addEventListener('click', () => this.graph.resetView());
    graphHeading.append(graphTitleBox, reset);
    const legend = element('div', 'legend'); legend.innerHTML = '<span><i class="dot lesson"></i>课程</span><span><i class="dot knowledge"></i>知识方法</span><span><i class="dot word"></i>单词卡</span><span><i class="line"></i>关系</span>';
    const graphContainer = element('div', 'g6-container');
    const wordCount = bundle.graph.nodes.filter((node) => node.type === 'word').length;
    this.status.textContent = `G6 D3 Force 图谱已加载：${wordCount} 个单词节点、${bundle.graph.nodes.length} 个总节点。拖拽节点会触发 DragElementForce 实时重新计算布局。`;
    graphPanel.append(graphHeading, legend, graphContainer, this.status);

    this.cardPanel.replaceChildren();
    this.renderKnowledge(bundle.graph.nodes.find((node) => node.id === bundle.lesson.id));
    workspace.append(graphPanel, this.cardPanel); shell.append(header, workspace); root.append(shell);

    await this.graph.mount(graphContainer, toG6Data(bundle), { onSelect: (id) => void this.selectNode(id, false) });
  }

  private async searchWord(): Promise<void> {
    if (!this.bundle) return;
    const query = this.input.value.trim().toLowerCase();
    const word = [...this.bundle.words.values()].find((item) => item.id.toLowerCase() === query)
      ?? [...this.bundle.words.values()].find((item) => item.id.toLowerCase().includes(query) || item.meaning.includes(this.input.value.trim()));
    if (!word) { this.status.textContent = '未找到该单词；可输入英文拼写或中文释义。'; return; }
    this.input.value = word.id;
    await this.selectNode(word.id, true);
  }

  private async selectNode(id: string, shouldFocus: boolean): Promise<void> {
    if (!this.bundle) return;
    if (shouldFocus) await this.graph.focus(id);
    const word = this.bundle.words.get(id);
    if (word) {
      this.renderCard(word);
      this.status.textContent = '已聚焦 ' + word.id + '。G6 FocusElement 已将节点定位到视图中心。';
      return;
    }
    this.renderKnowledge(this.bundle.graph.nodes.find((node) => node.id === id));
    this.status.textContent = '已聚焦知识节点。继续选择相连的单词查看卡片。';
  }

  private renderKnowledge(node?: SchemaNode): void {
    this.cardPanel.replaceChildren();
    const eyebrow = element('p', 'eyebrow'); eyebrow.textContent = 'KNOWLEDGE NODE';
    const title = element('h2'); title.textContent = node?.label ?? '四大法门';
    const text = element('p'); text.textContent = node?.description ?? this.bundle?.lesson.summary ?? '';
    this.cardPanel.append(eyebrow, title, text);
  }

  private renderCard(word: WordCard): void {
    this.cardPanel.replaceChildren();
    const eyebrow = element('p', 'eyebrow'); eyebrow.textContent = 'WORD CARD';
    const title = element('h2'); title.textContent = word.id;
    const family = element('span', 'tag'); family.textContent = word.family;
    const meaning = element('span', 'tag'); meaning.textContent = word.meaning;
    this.cardPanel.append(eyebrow, title, family, meaning);
    addSection(this.cardPanel, '课堂原始记忆方法', word.classroomMethod);
    addSection(this.cardPanel, '30 秒复现动作', word.rehearsal);
    addSection(this.cardPanel, '使用提醒', word.caution);
  }

  destroy(): void { this.graph.destroy(); }
}

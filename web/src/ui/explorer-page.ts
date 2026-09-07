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

type BundleLoader = () => Promise<LessonBundle>;

const relationLabels: Record<string, string> = {
  'classroom-contrast': '课堂对比',
  'classroom-family': '课堂词族',
  compound: '复合构词',
  explains: '讲解',
  knowledge: '知识归属',
  lesson: '课程归属',
  'lesson-chain': '课程链路',
  'lesson-contrast': '课程对比',
  reviews: '复习关联',
  teaches: '讲授',
  'usage-contrast': '用法对比',
  word: '词汇归属',
  'word-family': '词族扩展',
};

export class ExplorerPage {
  private readonly graph = new G6GraphAdapter();
  private readonly cardPanel = element('aside', 'card-panel panel');
  private readonly detailPanel = element('section', 'detail-card');
  private readonly relationPanel = element('section', 'relation-card');
  private readonly status = element('p', 'status');
  private input: HTMLInputElement | null = null;
  private root: HTMLElement | null = null;
  private reloadBundle: BundleLoader | null = null;
  private isReloading = false;
  private bundle: LessonBundle | null = null;

  async mount(root: HTMLElement, bundle: LessonBundle, reloadBundle?: BundleLoader): Promise<void> {
    this.root = root;
    this.reloadBundle = reloadBundle ?? this.reloadBundle;
    this.bundle = bundle;
    root.replaceChildren();
    const shell = element('main', 'app-shell');
    const graphContainer = element('div', 'g6-container');
    graphContainer.setAttribute('aria-label', '课程知识关系图谱');
    const graphLayer = element('div', 'graph-layer');
    graphLayer.append(graphContainer);
    const header = element('header', 'topbar');
    const heading = element('div');
    const eyebrow = element('p', 'eyebrow'); eyebrow.textContent = 'VOCABULARY KNOWLEDGE CARDS';
    const h1 = element('h1'); h1.textContent = '背单词知识图谱';
    const summary = element('p', 'subtitle'); summary.textContent = bundle.lesson.summary;
    heading.append(eyebrow, h1, summary);

    const searchBox = element('label', 'search card-search');
    const searchLabel = element('span'); searchLabel.textContent = '定位单词';
    const searchRow = element('div', 'search-row');
    const input = element('input') as HTMLInputElement;
    this.input = input;
    input.placeholder = '输入单词，例如 influence';
    input.setAttribute('list', 'word-options');
    const datalist = element('datalist') as HTMLDataListElement; datalist.id = 'word-options';
    bundle.words.forEach((word) => { const option = element('option') as HTMLOptionElement; option.value = word.id; option.label = word.meaning; datalist.append(option); });
    const locate = element('button'); locate.type = 'button'; locate.textContent = '定位';
    locate.addEventListener('click', () => void this.searchWord());
    input.addEventListener('keydown', (event) => { if (event.key === 'Enter') void this.searchWord(); });
    searchRow.append(input, locate); searchBox.append(searchLabel, searchRow, datalist);
    header.append(heading);

    const controls = element('section', 'graph-controls panel');
    const controlsHeading = element('div', 'panel-heading');
    const controlsTitleBox = element('div');
    const graphTitle = element('h2'); graphTitle.textContent = '图谱';
    controlsTitleBox.append(graphTitle);
    const reload = element('button', 'icon-button');
    reload.type = 'button';
    reload.setAttribute('aria-label', '重新加载知识图谱');
    reload.title = '重新加载知识图谱';
    reload.innerHTML = '<svg viewBox="0 0 24 24" aria-hidden="true"><path d="M20 11a8 8 0 1 0 2.1 5.4"/><path d="M20 4v7h-7"/></svg>';
    reload.addEventListener('click', () => void this.reload());
    controlsHeading.append(controlsTitleBox, reload);
    const legend = element('div', 'legend'); legend.innerHTML = '<span><i class="dot lesson"></i>课程</span><span><i class="dot knowledge"></i>知识方法</span><span><i class="dot word"></i>单词卡</span><span><i class="line"></i>关系</span>';
    const wordCount = bundle.graph.nodes.filter((node) => node.type === 'word').length;
    this.status.textContent = `${wordCount} 个单词节点 · ${bundle.graph.nodes.length} 个总节点 · 可拖拽、缩放与点选`;
    controls.append(controlsHeading, legend, this.status);

    this.cardPanel.replaceChildren(searchBox, this.relationPanel, this.detailPanel);
    this.renderKnowledge(bundle.graph.nodes.find((node) => node.id === bundle.lesson.id));
    this.renderRelations(bundle.lesson.id);
    shell.append(graphLayer, header, controls, this.cardPanel); root.append(shell);

    await this.graph.mount(graphContainer, toG6Data(bundle), { onSelect: (id) => void this.selectNode(id, false) });
  }

  private async searchWord(): Promise<void> {
    if (!this.bundle || !this.input) return;
    const input = this.input;
    const query = input.value.trim().toLowerCase();
    const word = [...this.bundle.words.values()].find((item) => item.id.toLowerCase() === query)
      ?? [...this.bundle.words.values()].find((item) => item.id.toLowerCase().includes(query) || item.meaning.includes(input.value.trim()));
    if (!word) { this.status.textContent = '未找到该单词；可输入英文拼写或中文释义。'; return; }
    input.value = word.id;
    await this.selectNode(word.id, true);
  }

  private async reload(): Promise<void> {
    if (this.isReloading || !this.root || !this.reloadBundle) return;
    this.isReloading = true;
    this.status.textContent = '正在重新加载知识并绘制图谱…';
    try {
      const bundle = await this.reloadBundle();
      await this.mount(this.root, bundle);
    } catch (error: unknown) {
      this.status.textContent = '重新加载失败：' + String(error);
    } finally {
      this.isReloading = false;
    }
  }

  private async selectNode(id: string, shouldFocus: boolean): Promise<void> {
    if (!this.bundle) return;
    if (shouldFocus) await this.graph.focus(id);
    const word = this.bundle.words.get(id);
    if (word) {
      this.renderCard(word);
      this.renderRelations(id);
      this.status.textContent = '已聚焦 ' + word.id + '。G6 FocusElement 已将节点定位到视图中心。';
      return;
    }
    this.renderKnowledge(this.bundle.graph.nodes.find((node) => node.id === id));
    this.renderRelations(id);
    this.status.textContent = '已聚焦知识节点。继续选择相连的单词查看卡片。';
  }

  private renderKnowledge(node?: SchemaNode): void {
    this.detailPanel.replaceChildren();
    const eyebrow = element('p', 'eyebrow'); eyebrow.textContent = 'KNOWLEDGE NODE';
    const title = element('h2'); title.textContent = node?.label ?? '四大法门';
    const text = element('p'); text.textContent = node?.description ?? this.bundle?.lesson.summary ?? '';
    this.detailPanel.append(eyebrow, title, text);
  }

  private renderCard(word: WordCard): void {
    this.detailPanel.replaceChildren();
    const eyebrow = element('p', 'eyebrow'); eyebrow.textContent = 'WORD CARD';
    const title = element('h2'); title.textContent = word.id;
    const family = element('span', 'tag'); family.textContent = word.family;
    const meaning = element('span', 'tag'); meaning.textContent = word.meaning;
    this.detailPanel.append(eyebrow, title, family, meaning);
    addSection(this.detailPanel, '课堂原始记忆方法', word.classroomMethod);
    addSection(this.detailPanel, '30 秒复现动作', word.rehearsal);
    addSection(this.detailPanel, '使用提醒', word.caution);
  }

  private renderRelations(nodeId: string): void {
    if (!this.bundle) return;
    this.relationPanel.replaceChildren();
    const title = element('h3', 'relation-title'); title.textContent = '关系';
    const parents = this.bundle.graph.edges.filter((edge) => edge.target === nodeId);
    const children = this.bundle.graph.edges.filter((edge) => edge.source === nodeId);
    this.relationPanel.append(
      title,
      this.createRelationGroup('上联节点', parents, 'source'),
      this.createRelationGroup('下联节点', children, 'target'),
    );
  }

  private createRelationGroup(
    heading: string,
    edges: LessonBundle['graph']['edges'],
    linkedNode: 'source' | 'target',
  ): HTMLElement {
    const group = element('section', 'relation-group');
    const title = element('h4'); title.textContent = heading;
    if (!this.bundle || edges.length === 0) {
      const empty = element('p', 'relation-empty'); empty.textContent = '暂无。';
      group.append(title, empty);
      return group;
    }
    const list = element('ul', 'relation-list');
    for (const edge of edges) {
      const node = this.bundle.graph.nodes.find((candidate) => candidate.id === edge[linkedNode]);
      if (!node) continue;
      const item = element('li');
      const targetButton = element('button', 'relation-link');
      targetButton.type = 'button';
      targetButton.textContent = node.label;
      targetButton.addEventListener('click', () => void this.selectNode(node.id, true));
      const type = element('span', 'relation-type'); type.textContent = relationLabels[edge.type] ?? edge.type;
      item.append(targetButton, type); list.append(item);
    }
    group.append(title, list);
    return group;
  }

  destroy(): void { this.graph.destroy(); }
}

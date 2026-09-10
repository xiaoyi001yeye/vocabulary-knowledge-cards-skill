import type { LessonBundle, LessonCatalog, SchemaNode, WordCard } from '../data/schema-types';
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
  const body = element('p'); body.textContent = text;
  section.append(title, body); panel.append(section);
}

type ExplorerOptions = {
  catalog: LessonCatalog;
  loadLesson: (lessonId: string) => Promise<LessonBundle>;
};

const relationLabels: Record<string, string> = {
  'classroom-contrast': '课堂对比', 'classroom-family': '课堂词族', compound: '复合构词', explains: '讲解',
  knowledge: '知识归属', lesson: '课程归属', 'lesson-chain': '课程链路', 'lesson-contrast': '课程对比',
  reviews: '复习关联', teaches: '讲授', 'usage-contrast': '用法对比', word: '词汇归属', 'word-family': '词族扩展',
};

export class ExplorerPage {
  private readonly graph = new G6GraphAdapter();
  private readonly cardPanel = element('aside', 'card-panel panel');
  private readonly detailPanel = element('section', 'detail-card');
  private readonly relationPanel = element('section', 'relation-card');
  private readonly status = element('p', 'status');
  private input: HTMLInputElement | null = null;
  private lessonSelect: HTMLSelectElement | null = null;
  private panelToggle: HTMLButtonElement | null = null;
  private isCardPanelCollapsed = false;
  private root: HTMLElement | null = null;
  private options: ExplorerOptions | null = null;
  private isLoadingLesson = false;
  private bundle: LessonBundle | null = null;

  async mount(root: HTMLElement, bundle: LessonBundle, options: ExplorerOptions): Promise<void> {
    this.root = root;
    this.options = options;
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

    const tools = element('div', 'lesson-tools');
    const lessonBox = element('label', 'lesson-picker');
    const lessonLabel = element('span'); lessonLabel.textContent = '选择课程';
    const select = element('select') as HTMLSelectElement;
    this.lessonSelect = select;
    select.setAttribute('aria-label', '选择课程');
    for (const lesson of options.catalog.lessons) {
      const option = element('option') as HTMLOptionElement;
      option.value = lesson.id;
      option.textContent = lesson.title;
      option.title = lesson.description ?? lesson.title;
      option.selected = lesson.id === bundle.lesson.id;
      select.append(option);
    }
    select.addEventListener('change', () => void this.selectLesson(select.value));
    lessonBox.append(lessonLabel, select);

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
    tools.append(searchBox);
    header.append(heading, tools);

    const controls = element('section', 'graph-controls panel');
    const controlsHeading = element('div', 'panel-heading');
    const controlsTitleBox = element('div');
    const graphTitle = element('h2'); graphTitle.textContent = bundle.lesson.title;
    controlsTitleBox.append(graphTitle);
    const reload = element('button', 'icon-button');
    reload.type = 'button';
    reload.setAttribute('aria-label', '重新加载当前课程');
    reload.title = '重新加载当前课程';
    reload.innerHTML = '<svg viewBox="0 0 24 24" aria-hidden="true"><path d="M20 11a8 8 0 1 0 2.1 5.4"/><path d="M20 4v7h-7"/></svg>';
    reload.addEventListener('click', () => void this.reloadCurrentLesson());
    controlsHeading.append(controlsTitleBox, reload);
    const legend = element('div', 'legend'); legend.innerHTML = '<span><i class="dot lesson"></i>课程</span><span><i class="dot knowledge"></i>知识方法</span><span><i class="dot word"></i>单词卡</span><span><i class="line"></i>关系</span>';
    const wordCount = bundle.graph.nodes.filter((node) => node.type === 'word').length;
    this.status.textContent = wordCount + ' 个单词节点 · ' + bundle.graph.nodes.length + ' 个总节点 · 全量小学英语词汇助记图谱';
    controls.append(controlsHeading, legend, this.status);

    const panelToggle = element('button', 'panel-toggle') as HTMLButtonElement;
    this.panelToggle = panelToggle;
    panelToggle.type = 'button';
    panelToggle.addEventListener('click', () => this.setCardPanelCollapsed(!this.isCardPanelCollapsed));
    this.cardPanel.replaceChildren(panelToggle, searchBox, this.relationPanel, this.detailPanel);
    this.syncCardPanelToggle();
    this.renderKnowledge(bundle.graph.nodes.find((node) => node.id === bundle.lesson.id));
    this.renderRelations(bundle.lesson.id);
    shell.append(graphLayer, header, controls, this.cardPanel); root.append(shell);
    await this.graph.mount(graphContainer, toG6Data(bundle), { onSelect: (id) => void this.selectNode(id, false) });
  }

  private async reloadCurrentLesson(): Promise<void> {
    if (this.bundle) await this.selectLesson(this.bundle.lesson.id, true);
  }

  private async selectLesson(lessonId: string, force = false): Promise<void> {
    if (this.isLoadingLesson || !this.options || !this.root || !this.bundle || (!force && lessonId === this.bundle.lesson.id)) return;
    this.isLoadingLesson = true;
    if (this.lessonSelect) this.lessonSelect.disabled = true;
    this.status.textContent = '正在加载所选课程的卡片与图谱…';
    try {
      const bundle = await this.options.loadLesson(lessonId);
      await this.mount(this.root, bundle, this.options);
    } catch (error: unknown) {
      this.status.textContent = '课程加载失败：' + String(error);
      if (this.lessonSelect) this.lessonSelect.value = this.bundle.lesson.id;
    } finally {
      this.isLoadingLesson = false;
      if (this.lessonSelect) this.lessonSelect.disabled = false;
    }
  }

  private setCardPanelCollapsed(collapsed: boolean): void {
    this.isCardPanelCollapsed = collapsed;
    this.syncCardPanelToggle();
  }

  private syncCardPanelToggle(): void {
    this.cardPanel.classList.toggle('is-collapsed', this.isCardPanelCollapsed);
    if (!this.panelToggle) return;
    this.panelToggle.textContent = this.isCardPanelCollapsed ? '展开侧栏' : '收起侧栏';
    this.panelToggle.setAttribute('aria-expanded', String(!this.isCardPanelCollapsed));
    this.panelToggle.setAttribute('aria-label', this.isCardPanelCollapsed ? '展开右侧信息栏' : '收起右侧信息栏');
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

  private async selectNode(id: string, shouldFocus: boolean): Promise<void> {
    if (!this.bundle) return;
    if (shouldFocus) await this.graph.focus(id);
    const word = this.bundle.words.get(id);
    if (word) {
      this.setCardPanelCollapsed(false);
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
    const title = element('h2'); title.textContent = node?.label ?? '课程知识';
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
    addSection(this.detailPanel, '来源', word.source);
    const evidenceText = word.evidence.provenanceStatus === 'candidate-token-match'
      ? `已归档 ${word.evidence.mentionIds.length} 条字幕候选记录、${word.evidence.reviewIds.length} 条复核记录；该匹配来自可复现的字幕 token 扫描，仍可继续人工或模型复核。`
      : '旧卡片尚未找到可复现的字幕 token 匹配；已保留原始卡片内容，等待后续补充精确证据。';
    addSection(this.detailPanel, '证据归档', evidenceText);
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
    this.relationPanel.append(title, this.createRelationGroup('上联节点', parents, 'source'), this.createRelationGroup('下联节点', children, 'target'));
  }

  private createRelationGroup(heading: string, edges: LessonBundle['graph']['edges'], linkedNode: 'source' | 'target'): HTMLElement {
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

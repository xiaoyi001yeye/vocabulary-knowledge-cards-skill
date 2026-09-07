import type { KnowledgeRecord, LessonBundle, RelationshipGraph, WordCard } from './schema-types';

const CATALOG_ID = 'all-vocabulary';

async function loadJson<T>(path: string): Promise<T> {
  // Reloading the graph must reflect the latest schema files, not a browser-cached copy.
  const response = await fetch(path, { cache: 'no-store' });
  if (!response.ok) throw new Error('无法读取 ' + path + '：HTTP ' + response.status);
  return response.json() as Promise<T>;
}

export class SchemaRepository {
  async loadLesson(lessonId: string): Promise<LessonBundle> {
    const { lesson, graph } = await this.loadLessonData(lessonId);
    return this.loadCards(lesson, graph);
  }

  async loadCatalog(lessonIds: string[]): Promise<LessonBundle> {
    if (lessonIds.length === 0) throw new Error('至少需要一门课程才能加载词汇目录');

    const lessons = await Promise.all(lessonIds.map((lessonId) => this.loadLessonData(lessonId)));
    const nodes: RelationshipGraph['nodes'] = [{
      id: CATALOG_ID,
      type: 'lesson',
      label: '全部词汇',
      description: `汇总 ${lessons.length} 门课程的单词卡片与知识关系。`,
    }];
    const edges: RelationshipGraph['edges'] = [];
    const seenNodeIds = new Set<string>([CATALOG_ID]);

    for (const { lesson, graph } of lessons) {
      const remap = new Map(graph.nodes.map((node) => [node.id, node.type === 'word' ? node.id : `${lesson.id}::${node.id}`]));
      for (const node of graph.nodes) {
        const id = remap.get(node.id);
        if (!id) throw new Error(`图谱 ${graph.id} 中的节点无法映射：${node.id}`);
        if (seenNodeIds.has(id)) throw new Error(`合并图谱存在重复节点：${id}`);
        seenNodeIds.add(id);
        nodes.push({ ...node, id });
      }
      for (const edge of graph.edges) {
        const source = remap.get(edge.source);
        const target = remap.get(edge.target);
        if (!source || !target) throw new Error(`图谱 ${graph.id} 存在悬空边：${edge.source} -> ${edge.target}`);
        edges.push({ ...edge, source, target });
      }
      const lessonNodeId = remap.get(lesson.id);
      if (!lessonNodeId) throw new Error(`图谱 ${graph.id} 缺少课程节点：${lesson.id}`);
      edges.push({ source: CATALOG_ID, target: lessonNodeId, type: 'lesson-chain' });
    }

    const wordCount = nodes.filter((node) => node.type === 'word').length;
    const catalog: KnowledgeRecord = {
      id: CATALOG_ID,
      title: '全部英语词汇',
      sourceType: 'catalog',
      summary: `汇总 ${wordCount} 张可复习的英语单词卡片，按课程、知识方法和词族关系组织。`,
      concepts: lessons.flatMap(({ lesson }) => lesson.concepts.map((concept) => ({
        ...concept,
        id: `${lesson.id}::${concept.id}`,
      }))),
      uncertainItems: lessons.flatMap(({ lesson }) => lesson.uncertainItems.map((item) => ({
        ...item,
        source: `${lesson.title}：${item.source}`,
      }))),
      reviewPlan: lessons.flatMap(({ lesson }) => lesson.reviewPlan.map((item) => `${lesson.title}：${item}`)),
    };
    return this.loadCards(catalog, { id: `${CATALOG_ID}-graph`, lessonId: CATALOG_ID, nodes, edges });
  }

  private async loadLessonData(lessonId: string): Promise<{ lesson: KnowledgeRecord; graph: RelationshipGraph }> {
    const [lesson, graph] = await Promise.all([
      loadJson<KnowledgeRecord>('/schema/knowledge/' + lessonId + '.json'),
      loadJson<RelationshipGraph>('/schema/relationships/' + lessonId + '.graph.json'),
    ]);
    return { lesson, graph };
  }

  private async loadCards(lesson: KnowledgeRecord, graph: RelationshipGraph): Promise<LessonBundle> {
    const wordIds = graph.nodes.filter((node) => node.type === 'word').map((node) => node.id);
    const cards = await Promise.all(wordIds.map((id) => loadJson<WordCard>('/schema/words/' + id + '.json')));
    return { lesson, graph, words: new Map(cards.map((card) => [card.id, card])) };
  }
}

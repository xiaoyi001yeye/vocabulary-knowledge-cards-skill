import type { KnowledgeRecord, LessonBundle, LessonCatalog, RelationshipGraph, WordCard } from './schema-types';

async function loadJson<T>(path: string): Promise<T> {
  // Lesson changes must appear after a refresh without relying on browser cache.
  const response = await fetch(path, { cache: 'no-store' });
  if (!response.ok) throw new Error('无法读取 ' + path + '：HTTP ' + response.status);
  return response.json() as Promise<T>;
}

function validateCatalog(catalog: LessonCatalog): LessonCatalog {
  if (!catalog.id || !catalog.title || !catalog.defaultLessonId || catalog.lessons.length === 0) {
    throw new Error('课程目录缺少必要字段。');
  }
  const lessonIds = new Set<string>();
  for (const lesson of catalog.lessons) {
    if (!lesson.id || !lesson.title) throw new Error('课程目录中存在缺少 id 或 title 的课程。');
    if (lessonIds.has(lesson.id)) throw new Error('课程目录包含重复课程 id：' + lesson.id);
    lessonIds.add(lesson.id);
  }
  if (!lessonIds.has(catalog.defaultLessonId)) {
    throw new Error('课程目录的默认课程不存在：' + catalog.defaultLessonId);
  }
  return catalog;
}

export class SchemaRepository {
  async loadCatalogIndex(): Promise<LessonCatalog> {
    return validateCatalog(await loadJson<LessonCatalog>('/schema/catalog.json'));
  }

  async loadLesson(lessonId: string): Promise<LessonBundle> {
    const [lesson, graph] = await Promise.all([
      loadJson<KnowledgeRecord>('/schema/knowledge/' + lessonId + '.json'),
      loadJson<RelationshipGraph>('/schema/relationships/' + lessonId + '.graph.json'),
    ]);
    if (lesson.id !== lessonId || graph.lessonId !== lessonId) {
      throw new Error('课程数据与请求的课程 id 不一致：' + lessonId);
    }
    return this.loadCards(lesson, graph);
  }

  private async loadCards(lesson: KnowledgeRecord, graph: RelationshipGraph): Promise<LessonBundle> {
    const wordIds = graph.nodes.filter((node) => node.type === 'word').map((node) => node.id);
    const cards = await Promise.all(wordIds.map((id) => loadJson<WordCard>('/schema/words/' + id + '.json')));
    for (const card of cards) {
      if (!wordIds.includes(card.id)) throw new Error('单词卡与图谱节点不匹配：' + card.id);
    }
    return { lesson, graph, words: new Map(cards.map((card) => [card.id, card])) };
  }
}

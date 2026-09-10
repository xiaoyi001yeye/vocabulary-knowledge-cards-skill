import { readdir, readFile } from 'node:fs/promises';
import { resolve } from 'node:path';

const root = resolve(import.meta.dirname, '..', 'schema');
const readJson = async (path) => JSON.parse(await readFile(path, 'utf8'));
const files = async (directory) => (await readdir(directory)).filter((name) => name.endsWith('.json')).sort();
const fail = (message) => { throw new Error(message); };

const [knowledgeFiles, graphFiles, wordFiles] = await Promise.all([
  files(resolve(root, 'knowledge')),
  files(resolve(root, 'relationships')),
  files(resolve(root, 'words')),
]);
const words = new Map();
for (const filename of wordFiles) {
  const card = await readJson(resolve(root, 'words', filename));
  const expectedId = filename.slice(0, -'.json'.length);
  if (card.id !== expectedId) fail(`Card ID mismatch: ${filename} declares ${card.id}`);
  if (words.has(card.id)) fail(`Duplicate card ID: ${card.id}`);
  for (const field of ['id', 'label', 'meaning', 'family', 'lessonId', 'source', 'classroomMethod', 'rehearsal', 'caution']) {
    if (typeof card[field] !== 'string' || card[field].trim() === '') fail(`Card ${card.id} is missing ${field}`);
  }
  words.set(card.id, card);
}

const lessons = new Map();
for (const filename of knowledgeFiles) {
  const lesson = await readJson(resolve(root, 'knowledge', filename));
  const expectedId = filename.slice(0, -'.json'.length);
  if (lesson.id !== expectedId) fail(`Knowledge ID mismatch: ${filename} declares ${lesson.id}`);
  if (lessons.has(lesson.id)) fail(`Duplicate lesson ID: ${lesson.id}`);
  if (!Array.isArray(lesson.concepts) || !Array.isArray(lesson.uncertainItems) || !Array.isArray(lesson.reviewPlan)) fail(`Lesson ${lesson.id} has invalid collection fields`);
  lessons.set(lesson.id, lesson);
}

const graphLessonIds = new Set();
let wordNodeCount = 0;
for (const filename of graphFiles) {
  const graph = await readJson(resolve(root, 'relationships', filename));
  const expectedId = filename.slice(0, -'.graph.json'.length);
  if (graph.lessonId !== expectedId) fail(`Graph lesson ID mismatch: ${filename} declares ${graph.lessonId}`);
  if (!lessons.has(graph.lessonId)) fail(`Graph ${filename} has no knowledge record`);
  if (graphLessonIds.has(graph.lessonId)) fail(`Duplicate graph for lesson ${graph.lessonId}`);
  graphLessonIds.add(graph.lessonId);
  const nodeIds = new Set();
  for (const node of graph.nodes) {
    if (nodeIds.has(node.id)) fail(`Graph ${filename} has duplicate node ${node.id}`);
    nodeIds.add(node.id);
    if (!['lesson', 'knowledge', 'word'].includes(node.type)) fail(`Graph ${filename} has invalid node type ${node.type}`);
    if (node.type === 'word') {
      wordNodeCount += 1;
      const card = words.get(node.id);
      if (!card) fail(`Graph ${filename} references missing card ${node.id}`);
      if (graph.lessonId !== 'primary-vocabulary-mnemonics-01' && card.lessonId !== graph.lessonId) fail(`Card ${node.id} belongs to ${card.lessonId}, not ${graph.lessonId}`);
    }
  }
  if (!nodeIds.has(graph.lessonId)) fail(`Graph ${filename} does not contain lesson node ${graph.lessonId}`);
  for (const edge of graph.edges) {
    if (!nodeIds.has(edge.source) || !nodeIds.has(edge.target)) fail(`Graph ${filename} has dangling edge ${edge.source} -> ${edge.target}`);
  }
}
for (const lessonId of lessons.keys()) if (!graphLessonIds.has(lessonId)) fail(`Lesson ${lessonId} has no relationship graph`);

const catalog = await readJson(resolve(root, 'catalog.json'));
if (!Array.isArray(catalog.lessons)) fail('Catalog has no lessons array');
const catalogIds = new Set();
for (const entry of catalog.lessons) {
  if (typeof entry.id !== 'string' || !lessons.has(entry.id)) fail(`Catalog references missing lesson ${entry.id}`);
  if (catalogIds.has(entry.id)) fail(`Catalog has duplicate lesson ${entry.id}`);
  catalogIds.add(entry.id);
}
for (const lessonId of lessons.keys()) if (!catalogIds.has(lessonId)) fail(`Lesson ${lessonId} is missing from catalog`);
if (!catalogIds.has(catalog.defaultLessonId)) fail(`Catalog default lesson is missing: ${catalog.defaultLessonId}`);
console.log(JSON.stringify({ lessons: lessons.size, catalogLessons: catalogIds.size, graphs: graphFiles.length, cards: words.size, wordNodes: wordNodeCount }, null, 2));

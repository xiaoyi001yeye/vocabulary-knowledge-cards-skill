import { readdir, readFile, writeFile } from 'node:fs/promises';
import { resolve } from 'node:path';

const schemaRoot = resolve(import.meta.dirname, '..', 'schema');
const wordsRoot = resolve(schemaRoot, 'words');
const graphPath = resolve(schemaRoot, 'relationships', 'primary-vocabulary-mnemonics-01.graph.json');
const files = (await readdir(wordsRoot)).filter((name) => name.endsWith('.json')).sort();
const cards = await Promise.all(files.map(async (name) => JSON.parse(await readFile(resolve(wordsRoot, name), 'utf8'))));
const methods = [
  { id: 'compound', label: '组合拆分', description: '通过可见的词、词缀或拼写组合建立初步记忆。' },
  { id: 'shape', label: '画面与形状', description: '通过图像、动作、场景或字母轮廓建立记忆画面。' },
  { id: 'sound', label: '读音与口形', description: '通过朗读、口形和近似声音建立记忆抓手。' },
  { id: 'family', label: '词族与对比', description: '通过词族、对照、近义或相反关系建立辨析。' },
  { id: 'meaning', label: '语义与场景', description: '通过基本含义、使用场景和复现动作建立理解。' },
];

function groupFor(family) {
  const value = String(family).toLowerCase();
  if (/sound|声音|读音|口形/.test(value)) return 'sound';
  if (/compound|组合|prefix|suffix|roots|word-form|abbreviation|词形/.test(value)) return 'compound';
  if (/family|contrast|comparison|polysemy|对比/.test(value)) return 'family';
  if (/shape|scene|movement|画面|形状|动作|场景|视觉|空间|植物|物体|学习|日常|颁奖|味觉|劳动|泄漏/.test(value)) return 'shape';
  return 'meaning';
}

const rootId = 'primary-vocabulary-mnemonics-01';
const graph = {
  id: rootId + '-graph',
  lessonId: rootId,
  nodes: [
    { id: rootId, type: 'lesson', label: '小学英语词汇助记课', description: '全量小学英语词汇助记图谱；课堂联想仅作记忆提示，并非严格词源图。' },
    ...methods.map((method) => ({ ...method, type: 'knowledge' })),
    ...cards.map((card) => ({ id: card.id, type: 'word', label: card.label, group: groupFor(card.family) })),
  ],
  edges: [
    ...methods.map((method) => ({ source: rootId, target: method.id, type: 'teaches' })),
    ...cards.map((card) => ({ source: groupFor(card.family), target: card.id, type: 'explains' })),
  ],
};
await writeFile(graphPath, JSON.stringify(graph, null, 2) + '\n');
console.log(JSON.stringify({ words: cards.length, nodes: graph.nodes.length, edges: graph.edges.length }, null, 2));

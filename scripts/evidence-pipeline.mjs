import { createHash } from 'node:crypto';
import { mkdir, readdir, readFile, rm, writeFile } from 'node:fs/promises';
import { basename, resolve } from 'node:path';

const projectRoot = resolve(import.meta.dirname, '..');
const inputRoot = resolve(projectRoot, 'input');
const schemaRoot = resolve(projectRoot, 'schema');
const evidenceRoot = resolve(schemaRoot, 'evidence');
const sourceRoot = resolve(evidenceRoot, 'sources');
const mentionRoot = resolve(evidenceRoot, 'mentions');
const lexemeRoot = resolve(evidenceRoot, 'lexemes');
const reviewRoot = resolve(evidenceRoot, 'reviews');
const scanRoot = resolve(evidenceRoot, 'scans');
const manifestPath = resolve(evidenceRoot, 'source-manifest.json');
const scannerVersion = 'deterministic-srt-v1';

const json = (value) => JSON.stringify(value, null, 2) + '\n';
const hash = (text) => createHash('sha256').update(text).digest('hex');
const readJson = async (path) => JSON.parse(await readFile(path, 'utf8'));
const fileNames = async (root, suffix) => (await readdir(root)).filter((name) => name.endsWith(suffix)).sort();
const exists = async (path) => readFile(path, 'utf8').then(() => true, () => false);

function parseTimestamp(value) {
  const match = value.trim().match(/^(\d{2}):(\d{2}):(\d{2}),(\d{3})$/);
  if (!match) throw new Error('Invalid SRT timestamp: ' + value);
  return ((((Number(match[1]) * 60) + Number(match[2])) * 60 + Number(match[3])) * 1000) + Number(match[4]);
}

function parseSrt(content) {
  const blocks = content.replace(/\r\n/g, '\n').trim().split(/\n{2,}/);
  return blocks.map((block, offset) => {
    const lines = block.split('\n');
    const sequence = Number(lines[0]);
    const timing = lines[1]?.match(/^(.+?)\s+-->\s+(.+)$/);
    if (!Number.isInteger(sequence) || !timing) throw new Error('Unparseable SRT block at offset ' + offset);
    return { id: String(sequence), sequence, startMs: parseTimestamp(timing[1]), endMs: parseTimestamp(timing[2]), text: lines.slice(2).join('\n') };
  });
}

function normalize(token) {
  return token.toLowerCase().replace(/[’']/g, '').trim().replace(/\s+/g, '-');
}

function extractTokens(text) {
  const tokens = [];
  const matcher = /[A-Za-z]+(?:[ '-][A-Za-z]+)*/g;
  let match; let ordinal = 0;
  while ((match = matcher.exec(text))) {
    const raw = match[0];
    const normalized = normalize(raw);
    if (normalized.length < 2) continue;
    tokens.push({ raw, normalized, start: match.index, end: match.index + raw.length, ordinal: ordinal++ });
  }
  return tokens;
}

async function ingest() {
  await Promise.all([mkdir(sourceRoot, { recursive: true }), mkdir(mentionRoot, { recursive: true }), mkdir(lexemeRoot, { recursive: true }), mkdir(reviewRoot, { recursive: true }), mkdir(scanRoot, { recursive: true })]);
  const names = await fileNames(inputRoot, '.srt');
  const entries = [];
  const unique = new Map();
  for (const name of names) {
    const bytes = await readFile(resolve(inputRoot, name));
    const content = bytes.toString('utf8');
    const contentHash = hash(bytes);
    const sourceId = 'source-' + contentHash.slice(0, 16);
    entries.push({ fileName: name, sourceId, contentHash, byteLength: bytes.length });
    if (!unique.has(sourceId)) unique.set(sourceId, { content, contentHash, byteLength: bytes.length, fileNames: [] });
    unique.get(sourceId).fileNames.push(name);
  }
  for (const [sourceId, item] of unique) {
    const segments = parseSrt(item.content).map((segment) => ({ ...segment, id: sourceId + ':s' + String(segment.sequence).padStart(6, '0'), rawTextHash: hash(segment.text) }));
    await writeFile(resolve(sourceRoot, sourceId + '.json'), json({ id: sourceId, contentHash: item.contentHash, byteLength: item.byteLength, fileNames: item.fileNames.sort(), parser: 'srt-v1', segmentCount: segments.length, segments }));
  }
  await writeFile(manifestPath, json({ id: 'source-manifest-v1', files: entries, uniqueSourceIds: [...unique.keys()].sort() }));
  console.log(json({ files: entries.length, uniqueSources: unique.size, segments: [...unique.values()].reduce((sum, item) => sum + parseSrt(item.content).length, 0) }));
}

async function scan() {
  if (!(await exists(manifestPath))) throw new Error('Run ingest before scan.');
  const manifest = await readJson(manifestPath);
  let count = 0;
  for (const sourceId of manifest.uniqueSourceIds) {
    const source = await readJson(resolve(sourceRoot, sourceId + '.json'));
    const mentions = source.segments.flatMap((segment) => extractTokens(segment.text).map((token) => ({
      id: sourceId + ':' + segment.sequence + ':' + token.ordinal + ':' + scannerVersion,
      sourceId,
      segmentId: segment.id,
      rawToken: token.raw,
      rawText: segment.text,
      normalizedCandidates: [token.normalized],
      candidateSpellings: [{ value: token.normalized, score: 1, reason: 'literal subtitle token' }],
      characterRange: { start: token.start, end: token.end },
      scanner: { id: 'deterministic-tokenizer', version: scannerVersion },
      status: 'unreviewed',
    })));
    count += mentions.length;
    await writeFile(resolve(mentionRoot, sourceId + '.json'), json({ sourceId, scanner: scannerVersion, mentions }));
    await writeFile(resolve(scanRoot, sourceId + '-' + scannerVersion + '.json'), json({ id: sourceId + '-' + scannerVersion, sourceId, scanner: scannerVersion, mentionCount: mentions.length }));
  }
  console.log(json({ uniqueSources: manifest.uniqueSourceIds.length, mentions: count, scanner: scannerVersion }));
}

async function migrate() {
  if (!(await exists(manifestPath))) throw new Error('Run ingest and scan before migrate.');
  const wordNames = await fileNames(resolve(schemaRoot, 'words'), '.json');
  const mentionFiles = await fileNames(mentionRoot, '.json');
  const mentionsByCandidate = new Map();
  for (const name of mentionFiles) {
    const file = await readJson(resolve(mentionRoot, name));
    for (const mention of file.mentions) for (const candidate of mention.normalizedCandidates) {
      const list = mentionsByCandidate.get(candidate) ?? [];
      list.push(mention.id); mentionsByCandidate.set(candidate, list);
    }
  }
  for (const name of wordNames) {
    const card = await readJson(resolve(schemaRoot, 'words', name));
    const mentionIds = mentionsByCandidate.get(card.id) ?? [];
    const legacyCard = Object.fromEntries(['id', 'label', 'meaning', 'family', 'lessonId', 'source', 'classroomMethod', 'rehearsal', 'caution'].map((field) => [field, card[field]]));
    await writeFile(resolve(lexemeRoot, card.id + '.json'), json({
      id: card.id,
      headword: card.id,
      status: 'confirmed',
      cardId: card.id,
      mentionIds,
      provenanceStatus: mentionIds.length > 0 ? 'candidate-token-match' : 'needs-evidence-link',
      legacyCard,
      legacyLessonId: card.lessonId,
      legacyMnemonicCategory: card.family,
      legacySourceLabel: card.source,
      migration: { importedFrom: 'schema/words/' + name, strategy: 'exact-normalized-token-match-v1' },
    }));
  }
  const linked = wordNames.filter((name) => mentionsByCandidate.has(name.slice(0, -'.json'.length))).length;
  await writeFile(resolve(reviewRoot, 'legacy-migration.json'), json({ id: 'legacy-migration-v1', decision: 'preserve-without-inventing-evidence', cards: wordNames.length, candidateTokenMatches: linked, unmatchedCards: wordNames.length - linked }));
  console.log(json({ cards: wordNames.length, candidateTokenMatches: linked, needsEvidenceLink: wordNames.length - linked, lexemes: wordNames.length }));
}

async function buildCards() {
  const wordNames = await fileNames(resolve(schemaRoot, 'words'), '.json');
  const reviewIdsByLexeme = new Map();
  for (const name of await fileNames(reviewRoot, '.json')) {
    if (name === 'legacy-migration.json') continue;
    const review = await readJson(resolve(reviewRoot, name));
    if (!review.lexemeId) continue;
    const ids = reviewIdsByLexeme.get(review.lexemeId) ?? [];
    ids.push(review.id); reviewIdsByLexeme.set(review.lexemeId, ids);
  }
  for (const name of wordNames) {
    const cardPath = resolve(schemaRoot, 'words', name);
    const card = await readJson(cardPath);
    const lexemePath = resolve(lexemeRoot, card.id + '.json');
    if (!(await exists(lexemePath))) throw new Error('Missing lexeme for card ' + card.id + '; run migrate.');
    const lexeme = await readJson(lexemePath);
    const evidence = { lexemeId: lexeme.id, mentionIds: lexeme.mentionIds, reviewIds: reviewIdsByLexeme.get(lexeme.id) ?? [], provenanceStatus: lexeme.provenanceStatus };
    if (!lexeme.legacyCard) throw new Error('Lexeme is missing immutable legacy card: ' + lexeme.id);
    await writeFile(cardPath, json({ ...lexeme.legacyCard, evidence }));
  }
  console.log(json({ cards: wordNames.length }));
}

async function recordReview(path) {
  if (!path) throw new Error('Provide a review JSON path.');
  const review = await readJson(resolve(projectRoot, path));
  const required = ['id', 'mentionId', 'decision', 'reviewer', 'reason'];
  for (const field of required) if (!review[field]) throw new Error('Review is missing ' + field);
  const mentionFiles = await fileNames(mentionRoot, '.json');
  const mentionIds = new Set();
  for (const name of mentionFiles) for (const mention of (await readJson(resolve(mentionRoot, name))).mentions) mentionIds.add(mention.id);
  if (!mentionIds.has(review.mentionId)) throw new Error('Review references unknown mention: ' + review.mentionId);
  const output = resolve(reviewRoot, review.id + '.json');
  if (await exists(output)) throw new Error('Review is append-only and already exists: ' + review.id);
  await mkdir(reviewRoot, { recursive: true });
  await writeFile(output, json({ ...review, recordedBy: 'evidence-pipeline-v1' }));
  console.log(json({ reviewId: review.id, mentionId: review.mentionId, decision: review.decision }));
}

async function inventory() {
  const wordNames = await fileNames(resolve(schemaRoot, 'words'), '.json');
  const cardIds = new Set(wordNames.map((name) => name.slice(0, -'.json'.length)));
  const candidates = new Map();
  for (const name of await fileNames(mentionRoot, '.json')) {
    const source = await readJson(resolve(mentionRoot, name));
    for (const mention of source.mentions) for (const candidate of mention.normalizedCandidates) {
      const record = candidates.get(candidate) ?? { id: candidate, occurrences: 0, sourceIds: new Set(), rawTokens: new Set(), mentionIds: [], sampleEvidence: [] };
      record.occurrences += 1;
      record.sourceIds.add(mention.sourceId);
      record.rawTokens.add(mention.rawToken);
      record.mentionIds.push(mention.id);
      if (record.sampleEvidence.length < 3) record.sampleEvidence.push({ mentionId: mention.id, text: mention.rawText });
      candidates.set(candidate, record);
    }
  }
  const entries = [...candidates.values()].map((record) => ({
    id: record.id,
    status: cardIds.has(record.id) ? 'covered-by-card' : 'needs-review',
    occurrences: record.occurrences,
    sourceCount: record.sourceIds.size,
    sourceIds: [...record.sourceIds].sort(),
    rawTokens: [...record.rawTokens].sort(),
    sampleEvidence: record.sampleEvidence,
    mentionIds: record.mentionIds.sort(),
  })).sort((a, b) => b.occurrences - a.occurrences || a.id.localeCompare(b.id));
  const summary = {
    id: 'candidate-inventory-v1',
    scanner: scannerVersion,
    generatedFrom: 'schema/evidence/mentions',
    totalOccurrences: entries.reduce((sum, entry) => sum + entry.occurrences, 0),
    uniqueCandidates: entries.length,
    coveredByCards: entries.filter((entry) => entry.status === 'covered-by-card').length,
    needsReview: entries.filter((entry) => entry.status === 'needs-review').length,
    candidates: entries,
  };
  await writeFile(resolve(evidenceRoot, 'candidate-inventory.json'), json(summary));
  console.log(json({ totalOccurrences: summary.totalOccurrences, uniqueCandidates: summary.uniqueCandidates, coveredByCards: summary.coveredByCards, needsReview: summary.needsReview }));
}

async function audit() {
  if (!(await exists(manifestPath))) throw new Error('Missing source manifest.');
  const manifest = await readJson(manifestPath);
  const sourceFiles = await fileNames(sourceRoot, '.json');
  const mentionFiles = await fileNames(mentionRoot, '.json');
  const lexemeFiles = await fileNames(lexemeRoot, '.json');
  const wordNames = await fileNames(resolve(schemaRoot, 'words'), '.json');
  if (sourceFiles.length !== manifest.uniqueSourceIds.length) throw new Error('Source record count does not match manifest.');
  if (mentionFiles.length !== sourceFiles.length) throw new Error('Every source must have one mention file.');
  if (lexemeFiles.length !== wordNames.length) throw new Error('Every card must have one lexeme record.');
  const fileToSource = new Map(manifest.files.map((entry) => [entry.fileName, entry.sourceId]));
  const sourceIds = new Set(); const segmentIds = new Map(); const mentionIds = new Set(); let segments = 0; let mentions = 0;
  for (const name of sourceFiles) {
    const source = await readJson(resolve(sourceRoot, name));
    if (sourceIds.has(source.id)) throw new Error('Duplicate source record: ' + source.id);
    sourceIds.add(source.id);
    if (source.segmentCount !== source.segments.length) throw new Error('Source segment count mismatch: ' + source.id);
    for (const fileName of source.fileNames) if (fileToSource.get(fileName) !== source.id) throw new Error('Source alias is absent from manifest: ' + fileName);
    for (const segment of source.segments) {
      if (!segment.text || segment.rawTextHash !== hash(segment.text)) throw new Error('Segment raw text is not preserved: ' + segment.id);
      if (segmentIds.has(segment.id)) throw new Error('Duplicate segment: ' + segment.id);
      segmentIds.set(segment.id, segment); segments += 1;
    }
  }
  if (sourceIds.size !== new Set(manifest.files.map((entry) => entry.sourceId)).size) throw new Error('Manifest source IDs are not all archived.');
  for (const name of mentionFiles) { const file = await readJson(resolve(mentionRoot, name)); for (const mention of file.mentions) {
    const segment = segmentIds.get(mention.segmentId);
    if (!segment) throw new Error('Mention has unknown segment: ' + mention.id);
    if (mentionIds.has(mention.id)) throw new Error('Duplicate mention: ' + mention.id);
    if (mention.characterRange.start < 0 || mention.characterRange.end > segment.text.length || segment.text.slice(mention.characterRange.start, mention.characterRange.end) !== mention.rawToken) throw new Error('Mention span does not match source text: ' + mention.id);
    mentionIds.add(mention.id); mentions += 1;
  } }
  const lexemeIds = new Set(); let linked = 0; let needsEvidenceLink = 0;
  for (const name of lexemeFiles) { const lexeme = await readJson(resolve(lexemeRoot, name)); lexemeIds.add(lexeme.id); if (lexeme.provenanceStatus === 'candidate-token-match') linked += 1; else needsEvidenceLink += 1; for (const mentionId of lexeme.mentionIds) if (!mentionIds.has(mentionId)) throw new Error('Lexeme has unknown mention: ' + lexeme.id); }
  const reviewIds = new Set(); let reviews = 0;
  for (const name of await fileNames(reviewRoot, '.json')) {
    if (name === 'legacy-migration.json') continue;
    const review = await readJson(resolve(reviewRoot, name));
    if (!review.id || !review.mentionId || !review.decision || !review.reason || !mentionIds.has(review.mentionId)) throw new Error('Review is incomplete or untraceable: ' + name);
    if (reviewIds.has(review.id)) throw new Error('Duplicate review: ' + review.id);
    if (review.lexemeId && !lexemeIds.has(review.lexemeId)) throw new Error('Review has unknown lexeme: ' + review.id);
    reviewIds.add(review.id); reviews += 1;
  }
  for (const name of wordNames) { const card = await readJson(resolve(schemaRoot, 'words', name)); if (!card.evidence || card.evidence.lexemeId !== card.id || !Array.isArray(card.evidence.reviewIds)) throw new Error('Card is missing migrated evidence: ' + card.id); for (const reviewId of card.evidence.reviewIds) if (!reviewIds.has(reviewId)) throw new Error('Card has unknown review: ' + card.id); }
  console.log(json({ sourceFiles: manifest.files.length, uniqueSources: sourceFiles.length, segments, mentions, reviews, lexemes: lexemeFiles.length, candidateTokenMatchedLexemes: linked, needsEvidenceLinkLexemes: needsEvidenceLink }));
}

const command = process.argv[2];
if (command === 'ingest') await ingest();
else if (command === 'scan') await scan();
else if (command === 'migrate') await migrate();
else if (command === 'build-cards') await buildCards();
else if (command === 'record-review') await recordReview(process.argv[3]);
else if (command === 'inventory') await inventory();
else if (command === 'audit') await audit();
else throw new Error('Usage: node scripts/evidence-pipeline.mjs <ingest|scan|migrate|build-cards|record-review|inventory|audit>');

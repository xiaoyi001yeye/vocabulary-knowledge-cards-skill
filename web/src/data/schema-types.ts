export type KnowledgeConcept = { id: string; label: string; description: string };

export type KnowledgeRecord = {
  id: string;
  title: string;
  sourceType: string;
  summary: string;
  concepts: KnowledgeConcept[];
  uncertainItems: Array<{ source: string; candidates: string[]; reason: string }>;
  reviewPlan: string[];
};

export type WordCard = {
  id: string;
  label: string;
  meaning: string;
  family: string;
  lessonId: string;
  source: string;
  classroomMethod: string;
  rehearsal: string;
  caution: string;
};

export type SchemaNode = {
  id: string;
  type: 'lesson' | 'knowledge' | 'word';
  label: string;
  description?: string;
  group?: string;
};

export type SchemaEdge = { source: string; target: string; type: string };

export type RelationshipGraph = {
  id: string;
  lessonId: string;
  nodes: SchemaNode[];
  edges: SchemaEdge[];
};

export type LessonBundle = {
  lesson: KnowledgeRecord;
  graph: RelationshipGraph;
  words: Map<string, WordCard>;
};

export type LessonCatalogEntry = {
  id: string;
  title: string;
  description?: string;
};

export type LessonCatalog = {
  id: string;
  title: string;
  defaultLessonId: string;
  lessons: LessonCatalogEntry[];
};

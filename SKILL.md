---
name: vocabulary-knowledge-cards
description: Turn a lesson transcript, course note, or study text into an evidence-aware vocabulary learning pack: overview, word cards with the original classroom memory method, review tasks, uncertainty list, and Mermaid relationship diagrams. Use when a user asks to organize vocabulary teaching content, create word cards from a lesson, preserve a teacher's mnemonic method, or map word families.
---

# Vocabulary Knowledge Cards

## Outcome

Produce a navigable schema-backed learning pack from user-supplied learning content. The schema must distinguish three things: source evidence, the teacher's mnemonic method, and standard dictionary facts.

## Workflow

1. **Read the whole source.** Identify the course topic, explicit words/phrases, teaching examples, repeated methods, word families, and ambiguous transcript fragments.
   - Completion: every proposed card has a source-backed classroom method or is excluded.
2. **Classify vocabulary.** Create a formal card only when spelling, basic meaning, and the teaching method are sufficiently clear. Put uncertain items in 待核对项.md with the evidence gap.
   - Read [可信度判定规则](references/可信度判定规则.md) whenever transcription quality or English spelling is uncertain.
3. **Build schema records first.** Create one knowledge record, one word record per formal card, and one relationship graph using the templates in templates/.
   - Completion: the graph maps at least one central learning route and every edge points to existing nodes.
4. **Create one schema file per card.** Preserve the classroom sequence: question, sound/image/structure, inference, then answer.
   - Read [课堂助记法还原规则](references/课堂助记法还原规则.md) whenever the source uses analogies, sound play, visual imagery, or informal word analysis.
5. **Index and verify.** Create an index linking every card, group cards by family or method, then validate links, card count, uncertainty handling, and Mermaid syntax.
   - Read [关系图规则](references/关系图规则.md) when choosing graph nodes and edges.

## Required pack

~~~text
schema/
├── knowledge/
│   └── <lesson-id>.json
├── words/
│   └── <word-id>.json
└── relationships/
    └── <lesson-id>.graph.json

web/
└── reads schema data and renders the graph plus the selected word card
~~~

## Quality gate

- Every formal card contains a core meaning, a concrete source-derived mnemonic sequence, a reproducible review action, and a caution.
- Every uncertain English word is absent from formal cards and present in 待核对项.md.
- The graph makes claims only about the lesson's teaching path; it does not silently claim strict etymology.
- The index links to every formal card.
- Use [词汇卡片质量标准](references/词汇卡片质量标准.md) before declaring the pack complete.

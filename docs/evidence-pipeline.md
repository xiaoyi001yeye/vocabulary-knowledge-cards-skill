# 字幕证据流水线

本流水线将字幕来源、分段、候选词出现记录、旧卡迁移词条和学习卡投影分开保存。原始字幕证据不会由卡片构建过程覆盖。

## 数据关系

input/*.srt → schema/evidence/sources/ → schema/evidence/mentions/ → schema/evidence/lexemes/ → schema/words/ → 统一图谱。

- `source-manifest.json` 记录全部输入文件及其唯一内容来源；内容相同的字幕文件共享一个来源 ID。
- `sources/*.json` 保留所有字幕分段、时间范围、原文和原文哈希。
- `mentions/*.json` 保存确定性扫描得到的每个英文 token、文本范围和规范化候选。
- `scans/*.json` 保存扫描器版本与扫描数量。
- `lexemes/*.json` 保留旧卡片的不可变快照，以及它与候选记录的关系。
- `reviews/*.json` 是只追加的复核记录；不能覆盖已有决定。

## 命令

    pnpm evidence:ingest
    pnpm evidence:scan
    pnpm evidence:inventory
    pnpm evidence:migrate
    pnpm evidence:build-cards
    pnpm rebuild:primary-graph
    pnpm evidence:audit

建议完整执行：

    pnpm evidence:rebuild && pnpm validate:schema && pnpm build

## 复核记录

使用 `pnpm evidence:record-review -- path/to/review.json` 写入新的复核记录。记录必须引用已存在的 `mentionId`，并包含 `id`、`decision`、`reviewer` 和 `reason`。同一 ID 不可重复写入。

    {
      "id": "review-example-001",
      "mentionId": "source-...:123:0:deterministic-srt-v1",
      "decision": "confirm",
      "lexemeId": "example",
      "reviewer": { "kind": "human", "id": "reviewer-name" },
      "reason": "拼写、释义和课堂上下文均已核对。"
    }

## 证据状态

- `candidate-token-match`：现有词条在字幕中有精确 token 匹配；这表示可复现的候选关联，不自动声称课堂释义已经人工确认。
- `needs-evidence-link`：旧卡片缺少可复现的精确 token 匹配。旧卡的原始字段完整保留，等待复核补充。

## 审计保证

`pnpm evidence:audit` 校验每份字幕来源、别名、分段原文哈希、候选范围、词条引用和卡片投影。审计失败时不得发布重新生成的卡片或图谱。

## 不丢失信息的工作准则

这套流程的目标不是让候选数量等于卡片数量，而是让每一条输入和每一次判断都可回溯。

1. 原始 SRT 与字幕分段是不可变证据；不得因扫描器、提示词或卡片规则变化而覆盖或删除。
2. 每个英文 token 都先作为 Candidate Mention 保存。它可能是单词、专名、课堂口头语、缩写、拼写错误或噪声；尚未确认不等于删除。
3. 模型或人工只能追加 Review，不能直接以提示词结果覆盖卡片或来源数据。
4. 只有拼写、基础释义和课堂上下文都足够可靠时，候选才可提升为正式 WordCard。
5. 同一词条允许关联多条 Mention 和多条 Review；词条去重不能删除每次出现的课堂讲解。
6. 缺乏精确证据的旧卡保持 `needs-evidence-link`，不能用课程编号或相似文字伪造时间戳、文件或原话。
7. 学习卡与统一图谱均是派生投影；改动分类、助记方式或扫描器后，应重新构建投影，而不是修改证据层。

## 候选到卡片的复核门槛

候选必须同时满足下列条件才加入正式卡片：

- 规范英语拼写可以确认；
- 至少有一个可定位的字幕分段和 token 范围；
- 基础中文释义可信；
- 课堂助记法确实由该段或可链接的复核记录支持；
- 助记法明确标注为课堂联想，而非严格词源；
- 与既有词条不是简单重复，或能提供新的、可追溯的课堂讲解。

不满足条件的候选仍留在 Mention/Review 层，以 `needs-review` 或带原因的排除状态保存，供以后用更好的模型、人工听音或新证据重新处理。

## 增词的正确方式

原始候选记录包含重复出现、课堂英语口头语、人名、缩写和转写噪声，因此候选总数不会也不应该等于单词卡总数。应先生成候选库存，按出现频率、已有词卡覆盖、拼写形态和上下文线索筛选，再逐条复核。每次新增卡片后都运行完整重建与审计命令，保证新增的是带证据的词，而不是从提示词中直接写入的猜测。


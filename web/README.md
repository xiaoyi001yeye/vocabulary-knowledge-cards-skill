# G6 Web Explorer

该 Web 项目使用 Vite、TypeScript 和 AntV G6 5.1.1 渲染课程、知识方法、单词卡片及其关系。

## 数据来源

唯一的内容来源是项目根目录的 `schema/`：

- `schema/knowledge/`：课程知识、复习计划和待核对项；
- `schema/words/`：每个单词的独立卡片；
- `schema/relationships/`：图节点与边。

Vite 在启动和构建前自动把该目录同步到临时的 `web/public/schema/`，供浏览器读取；该镜像不提交。

## 启动

```bash
pnpm install
pnpm dev
```

默认打开 Vite 输出的本地地址。

## 验证

```bash
pnpm build
```

## 页面交互

- G6 使用 `d3-force` 力导向布局渲染课程、知识节点和单词节点，并通过 `drag-element-force` 在拖拽时实时重新计算布局。
- 点击节点使用单选 `click-select`，只有当前节点保留选中高亮；同时使用 `focus-element` 将节点聚焦到视图中心。
- 输入英文单词或中文释义后，页面执行相同的选中、卡片刷新和 `focusElement` 聚焦流程。
- Graph Adapter 负责 G6 的选中状态、聚焦、缩放与销毁。
- 右侧卡片展示同一 Schema 中的课堂记忆方法、复现动作和提醒。

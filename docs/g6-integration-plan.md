# AntV G6 集成技术方案

## 结论

推荐将现有零依赖 SVG 页面升级为 **Vite + TypeScript + @antv/g6**，但保持 `schema/` 为唯一的内容来源。G6 只负责图的布局、渲染、交互和视口动画；现有原生 DOM 侧栏继续从 schema 数据渲染单词卡片。

这样能把当前 `web/app.js` 中混合的“数据加载、布局计算、SVG 绘制、搜索、旋转、卡片渲染”拆成几个深模块，让页面调用者只需要很小的 interface。

## 当前状态

当前项目已经有合适的内容 seam：

- `schema/knowledge/*.json`：课程、知识点、待核对项、复习计划；
- `schema/words/*.json`：单词卡片；
- `schema/relationships/*.graph.json`：各课程的节点和边；
- `web/app.js`：自行计算坐标、绘制 SVG，并实现输入定位和旋转。

因此不建议为接入 G6 重写 schema。应把 schema 适配为 G6 的 `GraphData`，使数据模型保持稳定。

## 推荐技术栈

| 层 | 选择 | 原因 |
| --- | --- | --- |
| 构建 | Vite | 支持开发服务器、生产构建、静态部署和环境变量。 |
| 页面层 | Vite + TypeScript + 原生 DOM | 当前项目已经是无框架静态页面；保留低依赖接口，按模块拆分搜索栏、图容器和卡片侧栏。 |
| 图引擎 | `@antv/g6`（锁定 v5 的精确版本） | 提供图元素、布局、行为、视口和渲染生命周期能力。 |
| 数据 | 现有 JSON schema | 内容层独立于可视化实现，未来可换渲染器。 |
| 测试 | Vitest + Playwright | 前者验证 schema/适配；后者验证搜索、聚焦和卡片联动。 |

### 为什么选择 Vite 原生 TypeScript，而不是 CDN 或 React

可以在当前静态 HTML 中通过 CDN 导入 G6，但不推荐作为正式版本：依赖版本、类型、缓存策略和生命周期测试都会变得分散。Vite 的代价很小，而能让 G6 版本锁定、构建结果和测试都进入项目管理。

当前页面没有复杂组件树或共享 UI 状态，React 不会带来与其引入成本相称的 leverage。因此第一版保留原生 DOM，使用 TypeScript 模块化；只有出现多课程路由、编辑器、协作状态或大量复用视图时，再评估 React。

## 目标目录

~~~text
web/
├── package.json
├── vite.config.ts
├── index.html
├── src/
│   ├── main.ts
│   ├── ExplorerPage.ts
│   ├── data/
│   │   ├── SchemaRepository.ts
│   │   └── schemaTypes.ts
│   ├── graph/
│   │   ├── G6GraphAdapter.ts
│   │   ├── toG6Data.ts
│   │   └── graphTheme.ts
│   ├── ui/
│   │   ├── WordSearchView.ts
│   │   └── WordCardView.ts
│   └── styles/
│       └── app.css
└── tests/
    ├── toG6Data.test.ts
    └── explorer.spec.ts
~~~

## 模块设计

### 1. SchemaRepository 模块

**Interface**：

~~~ts
type LessonBundle = { lesson: KnowledgeRecord; graph: RelationshipGraph; words: Map<string, WordCard> };

interface SchemaRepository {
  loadLesson(lessonId: string): Promise<LessonBundle>;
  loadCatalog(lessonIds: string[]): Promise<LessonBundle>;
  loadWord(lessonId: string, wordId: string): Promise<WordCard>;
}
~~~

**Implementation**：`loadLesson` 读取单门课程的数据；`loadCatalog` 合并多门课程的图谱并加载所有对应单词文件。当前目录页合并两门课程，共 74 张卡片；扩展到数百或上千单词时，增加 `schema/words/index.json`，图首次只取索引，选中节点后再懒加载单词详情。

这条 seam 使 G6、DOM 卡片视图和未来的导入脚本都不直接知道文件路径细节。

### 2. toG6Data 模块

**Interface**：

~~~ts
function toG6Data(bundle: LessonBundle): GraphData;
~~~

它将现有的：

- `lesson | knowledge | word` 节点类型；
- `teaches | explains | word-family | lesson-chain | reviews` 边类型；
- 单词的 `family`、中文释义和卡片 ID；

映射成 G6 节点和边数据。它不加载文件、不操作 DOM、不渲染卡片。

这个模块是数据模型和 G6 之间的唯一 adapter：如果将来替换图引擎，schema 与搜索体验无需一起重写。

### 3. G6GraphAdapter 模块

**Interface**：

~~~ts
interface GraphExplorer {
  mount(container: HTMLElement, data: GraphData, onSelect: (nodeId: string) => void): void;
  focus(nodeId: string): Promise<void>;
  resetView(): void;
  resize(): void;
  destroy(): void;
}
~~~

**Implementation** 隐藏以下复杂度：

- 创建和销毁 G6 Graph；
- 节点、边、标签、状态样式与布局；
- 点击元素、拖拽画布、缩放、悬停和选中行为；
- 搜索后的高亮、视口聚焦、旋转动画；
- 页面销毁、容器尺寸变化和重复挂载。

ExplorerPage 只调用 `focus(wordId)`，不直接调用 G6。这个深模块使 G6 生命周期和视口细节有良好的 locality。

## 图数据和样式映射

| Schema 节点 | G6 节点样式 | 含义 |
| --- | --- | --- |
| `lesson` | 大号圆形、紫色 | 课程总主题 |
| `knowledge` | 中号圆形、青色 | 音、形、义、根缀、复习 |
| `word` | 小号圆形、橙色 | 可选中单词卡 |

| Schema 边 | G6 边样式 |
| --- | --- |
| `teaches` / `explains` | 中性实线 |
| `word-family` | 紫色加粗线 |
| `lesson-chain` | 橙色虚线 |
| `reviews` | 低对比辅助线 |

布局首版采用固定层级/径向混合布局：课程节点居中，知识节点围绕课程，单词按 family 聚簇。后续可通过 G6 的布局能力替换为 radial 或 force，而不改变 schema。

## 搜索、旋转和卡片联动

1. 用户输入英文单词或中文释义。
2. ExplorerPage 在 `LessonBundle.words` 中解析唯一单词 ID。
3. 调用 `GraphExplorer.focus(id)`。
4. Adapter 执行：选中节点 → 淡化无关节点 → 聚焦元素 → 做一次短暂的视口旋转/平移动画。
5. `onSelect(id)` 回调更新 ExplorerPage 的选中 ID，WordCardView 用同一个 ID 显示课堂原始记忆方法、复现动作和提醒。

对于“旋转”体验，采用两层策略：

- 首选 G6 的视口/元素聚焦能力，让目标节点进入稳定的可读视野；
- 锁定 G6 v5 后，由 Adapter 先使用 `focus-element` / Graph 聚焦能力和 `zoom-canvas` 能力将目标放入可读视野；再在 spike 中调用锁定版本提供的 Graph 旋转操作或自定义行为完成短时旋转。G6 没有内置“搜索并旋转”的单一行为，因此搜索状态、聚焦和旋转必须由 Adapter 编排。若旋转导致文字倒置或不适合二维阅读，降级为聚焦、缩放和平移。

旋转是表现层能力，不能写入 schema，也不应由 ExplorerPage 调用具体 G6 方法。

## G6 初始配置方向

在实现 spike 中，创建 Graph 时应验证并锁定：

- 容器宽高和 `ResizeObserver` 下的 `resize`；
- 节点/边类型与状态样式；
- `drag-canvas`、`zoom-canvas`、元素点击选择、悬停提示等内置行为；
- 适合本项目数据量的 Canvas 渲染器；
- render 后的布局、`autoFit` 和动画时序；
- 页面卸载时的 `destroy`。

将 G6 精确方法名、行为配置和版本特性固定在 `G6GraphAdapter` 内，避免把版本差异泄露到 UI。

## 迁移步骤

1. **建立 Web 包**：在 `web/` 初始化 Vite TypeScript，并锁定 `@antv/g6`。保留现有静态页面作为视觉参考。
2. **冻结 schema 合约**：为 knowledge、word、relationship JSON 建立 TypeScript 类型；添加 `schema/words/index.json` 以支持懒加载。同时按 G6 v5 规则使用 `setData` 更新图数据、`setData + render` 代替旧式 `read`，以 `autoFit` 代替旧式 `fitView/fitCenter` 选项，并使用 `zoomRange` 管理缩放范围。
3. **先做 adapter spike**：先渲染单门课程的节点和边，验证 G6 数据映射、布局、事件和销毁；目录页再合并多门课程。
4. **接入卡片与搜索**：用 ExplorerPage 的选中 ID 连接 `WordSearchView → GraphExplorer.focus → WordCardView`。
5. **实现旋转降级**：在目标浏览器中验证旋转时的标签可读性；不通过则使用聚焦平移替代。
6. **删除旧 SVG 实现**：只有 G6 页面达到验收标准后才移除 `web/app.js` 的手工 SVG 布局。

## 验收标准

- `pnpm dev` 能打开图谱，`pnpm build` 成功。
- 页面从 schema 加载目录中的 74 张卡片，并在合并图谱中展示 88 个节点。
- 输入 `influence`、`flow` 或中文释义都能选中唯一节点。
- 选中节点后图产生聚焦动画；支持时执行旋转，否则保持可读标签的平移聚焦。
- 右侧卡片显示同一 JSON 中的 `classroomMethod`、`rehearsal`、`caution`。
- 图节点、边或卡片文件缺失时，在 UI 展示明确错误，而不是静默失败。
- 测试覆盖 schema 映射、边引用、搜索解析、聚焦回调和卸载销毁。

## 风险与决策

| 风险 | 应对 |
| --- | --- |
| G6 版本间配置差异 | 锁定精确版本；将版本相关调用集中在 G6GraphAdapter。 |
| 2D 旋转导致标签倒置 | 以可读性为硬约束；旋转不可读时降级为聚焦和平移。 |
| 单词数量增长导致首次加载变慢 | 增加 words/index.json，卡片详情按选择懒加载。 |
| 转写错误被图谱放大 | 保持 uncertainItems，未核对词不进入正式节点。 |
| 页面状态与 G6 双重状态 | schema 和 ExplorerPage 的选中 ID 为真相来源；G6 只保存渲染状态。 |

## 官方资料

- [G6 Installation](https://g6.antv.antgroup.com/en/manual/getting-started/installation)
- [G6 Quick Start](https://g6.antv.antgroup.com/en/manual/getting-started/quick-start)
- [G6 Graph configuration](https://g6.antv.antgroup.com/manual/graph/graph)
- [G6 Behavior overview](https://g6.antv.antgroup.com/en/manual/behavior/overview)
- [G6 Focus Element behavior](https://g6.antv.antgroup.com/en/manual/behavior/focus-element)
- [G6 Zoom Canvas behavior](https://g6.antv.antgroup.com/en/manual/behavior/zoom-canvas)
- [G6 v5 Upgrade guide](https://g6.antv.antgroup.com/en/manual/whats-new/upgrade)
- [G6 Viewport operations](https://g6.antv.vision/en/api/viewport/)
- [G6 FocusElement behavior source documentation](https://github.com/antvis/G6/blob/c2e1a752/packages/site/docs/manual/behavior/FocusElement.en.md?plain=1#1)

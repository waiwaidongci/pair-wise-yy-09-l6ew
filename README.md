# Token Forge 设计令牌工作台

基于 SolidJS、TypeScript、Vite、Kobalte、Tailwind CSS、Solid Router 和 Style Dictionary 的本地设计令牌工作台。

## 运行

```bash
corepack pnpm install
corepack pnpm dev
```

生产构建：

```bash
corepack pnpm build
corepack pnpm tokens:build
```

## 已实现功能

- 管理颜色、字号、间距、圆角、阴影和动效时长令牌。
- 多套主题切换、复制和本地持久化。
- 编辑令牌后组件预览实时刷新。
- 自动计算正文与关键颜色组合的 WCAG 对比度等级。
- 保存修改快照并比较两次修改之间的差异，历史发布按原快照导出。
- 导入 JSON，导出 Style Dictionary JSON、CSS Variables 和 Sass Variables。
- `tokens:build` 使用 Style Dictionary 输出 CSS、SCSS 和扁平 JSON。

## 修订工作流（导入包 · 草稿 · 发布快照）

设计团队从外部令牌包同步基础值、别名和引用目标，主题草稿可在编辑中续作：

- **导入包**：支持 `{package:{name,version}, tokens:{...}}` 包格式与扁平键值 JSON；同名包按版本号识别，工具栏显示当前包版本与“已过期”状态。
- **别名重算**：基础值更新后，未覆盖的别名失效并按新基础值重算；显式覆盖保留并标“待复核”，可随时“恢复引用”。
- **按令牌合并**：两个标签页同时修改同一主题时，以最近同步值为基线做三方合并；仅一侧改动取该侧，两侧改同一令牌且不同值时两边都留（标记“冲突两边留”），可点选某一边采用。
- **导出前校验**：引用成环、目标缺失、包过期或未决冲突时拦下导出，本批编辑完整保留并列出待处理项。
- **旧草稿升级**：无包来源的旧草稿导入新包时按当前现值升级，补引用、清旧覆盖。
- **历史快照**：发布快照保存完整主题，导出时按原快照状态输出，不被后续同步重算。

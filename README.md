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
- 保存修改快照并比较两次修改之间的差异。
- 导入 JSON，导出 Style Dictionary JSON、CSS Variables 和 Sass Variables。
- `tokens:build` 使用 Style Dictionary 输出 CSS、SCSS 和扁平 JSON。

## 修订流（导入包 · 草稿 · 发布快照）

- 外部令牌包（工作台主题 / Style Dictionary / 扁平键值 JSON）解析为**可续作修订**；同一令牌包重复导入会续版本历史，不丢旧解析结果与待确认快照。
- 令牌值可填 `{token.path}` 建立别名引用；基础值更新后未覆盖的别名自动失效重算，显式覆盖保留原值并标记**待复核**（可确认或恢复引用）。
- 两个标签页同时修改同一主题时**按令牌三路合并**；同一令牌的不同值冲突两侧都保留，在修订中心取舍。
- 引用成环、引用目标缺失或令牌包过期时，本批编辑保留并**停在导出前**，修订中心列出全部阻塞项。
- 旧版本本地草稿缺少引用元数据时按现值自动升级；历史发布快照始终按保存时冻结的解析值导出。

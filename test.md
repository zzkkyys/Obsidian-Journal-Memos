Role: 你是一位资深的 Obsidian 插件开发专家，精通 TypeScript、Svelte（或 React）以及 Obsidian API。

Task: 我想开发一个名为 "Journal Memos" 的 Obsidian 插件。它的核心理念是模仿 usememos/memos 的 UI 交互，但数据完全去中心化，存储在用户已有的“日记文件”（Daily Notes）中。

Core Requirements:

数据存储逻辑：

插件不使用独立的数据库，而是直接读写日记文件（格式通常为 YYYY-MM-DD.md）。

每条 Memo 在 Markdown 中以特定的格式存在，比如：

```memos
created: 2026-02-07 09:45
你好llll
```


UI 视图：

输入区： 类似 memos 的置顶输入框，点击“发布”后，自动追加到当日日记文件的末尾（若文件不存在则自动创建）。

流式列表（Stream View）： 倒序展示过去 N 天的所有 Memo 卡片。

热力图： 并在顶部显示类似 GitHub 的贡献热力图，点击日期跳转到对应的日记。

技术栈要求：

使用 TypeScript 开发。

视图层推荐使用 Svelte（轻量且符合 Obsidian 社区主流）。

利用 app.metadataCache 和 TFile 高效检索数据，避免全文扫描导致的性能问题。

Output Content:

数据解析器设计： 请写出一个核心函数，展示如何使用正则高效地从多个 Markdown 文件中提取 Memo 块。

文件操作逻辑： 展示如何使用 app.vault.process 或 app.vault.append 安全地写入数据。

项目结构建议： 给出插件的文件目录建议（尤其是如何分离 View 层和 Data 层）。

性能优化： 针对大量日记文件（例如 3 年以上的日记），如何利用 Obsidian 的索引机制实现秒开？
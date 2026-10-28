# second-brain-kit

一个随手往聊天框里丢东西、由 AI 每天整理成个人 wiki 的"第二大脑"。基于 Karpathy 提出的 [LLM-Wiki 模式](docs/llm-wiki.md)：

- **收集**：在手机上把链接、文件、想法发进飞书群，不改变任何习惯。
- **整理**：电脑开着时说一句"处理收件箱"，Claude Code 调用 `kb` 脚本拉取、抓取、归档，把内容编译进 Obsidian 里的主题页、项目页和生活页。
- **思考**：每次处理后只问你一个问题，你的回答以原话存进"思考"。AI 不代写你的观点。

> 🚧 **开发中**：当前处于 P0（骨架）阶段，`kb` 的各个子命令还没有实现。完整的安装与使用说明会在 P4 补齐。

## 两部分

| | kit（本仓库） | vault（你的知识库） |
| --- | --- | --- |
| 是什么 | 脚本、vault 模板、测试、文档 | Obsidian vault，放在 iCloud |
| 内容 | 只有系统文件和虚构的示例数据 | 你的全部个人内容，**永远不会**进入本仓库 |

## 目录

```
bin/kb.mjs          统一命令入口：kb <子命令>
src/                各子命令的实现
vault-template/     vault 的初始内容：CLAUDE.md 规则、页面模板、个人设置
examples/           虚构的示例收藏，用于演示和测试
test/               vitest 单元测试，全部离线运行
docs/               PRD、技术方案、Karpathy 原文
```

## 开发

需要 Node.js 20 及以上。

```bash
npm install
```

```bash
npm test
```

```bash
node bin/kb.mjs --help
```

设计依据见 [docs/PRD.md](docs/PRD.md) 和 [docs/TECH.md](docs/TECH.md)。开发按 P0 → P4 分阶段进行，每个阶段一个 PR。

## 许可证

[MIT](LICENSE)

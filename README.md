# second-brain-kit

一个随手往聊天框里丢东西、由 AI 每天整理成个人 wiki 的"第二大脑"。基于 Karpathy 提出的 [LLM-Wiki 模式](docs/llm-wiki.md)：

- **收集**：在手机上把链接、文件、想法发进飞书群，不改变任何习惯。
- **整理**：电脑开着时说一句"处理收件箱"，Claude Code 调用 `kb` 脚本拉取、抓取、归档，把内容编译进 Obsidian 里的主题页、项目页和生活页。
- **思考**：每次处理后只问你一个问题，你的回答以原话存进"思考"。AI 不代写你的观点。

> 🚧 **开发中**：已完成 P1（本地闭环），可以用 vault 里的 `inbox/` 文件夹试用；飞书拉取（P2）和网页抓取（P3）还没做。正式的一键安装会在 P4 补齐。

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

## 试用（P1）

需要 Node.js 20+、git 和 [Claude Code](https://claude.com/claude-code)。下面用一个临时的试用 vault，不会动你现有的任何笔记。

1. 安装 kit，并让 `kb` 命令全局可用：

   ```bash
   git clone https://github.com/zhanlutuzi/second-brain.git ~/second-brain-kit
   ```

   ```bash
   cd ~/second-brain-kit && npm install && npm link
   ```

2. 用模板建一个试用 vault，把 20 条示例放进收件箱：

   ```bash
   cp -R ~/second-brain-kit/vault-template ~/kb-trial && cd ~/kb-trial && mv gitignore .gitignore && cp ~/second-brain-kit/examples/inbox/* inbox/
   ```

   ```bash
   git init -q --separate-git-dir ~/.second-brain/trial.git && git add -A && git commit -qm init
   ```

3. 在 vault 里启动 Claude Code，说"处理收件箱"：

   ```bash
   cd ~/kb-trial && claude
   ```

4. 用 Obsidian 打开 `~/kb-trial` 查看结果。之后可以直接提问，例如"读书会小程序为什么延期"。

试完删除 `~/kb-trial` 和 `~/.second-brain/trial.git` 即可。

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

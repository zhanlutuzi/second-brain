---
name: setup
description: 在一台电脑上安装第二大脑。当用户在 second-brain-kit 目录里说"安装"、"开始使用"、"初始化"、"在另一台电脑上装"，或输入 /setup 时使用：检查环境、新建 vault 或接入已有的 vault、配置飞书（可选）、测试连通性。
---

# 首次安装

你正在 kit 仓库（second-brain-kit）里运行。全程用中文，一次只问一个问题。每一步完成后告诉用户结果，再进入下一步。

## 第 1 步：检查环境

1. 运行 `node --version`，需要 20 或以上。没有的话告诉用户怎么装（推荐 Homebrew：`brew install node`），装好再继续。
2. 在 kit 目录运行 `npm install`，再运行 `npm link`，然后运行 `kb --version` 确认命令可用。`npm link` 报权限错误时，告诉用户可以运行 `sudo npm link`。
3. 运行 `npx playwright install chromium` 安装抓取公众号等网页用的浏览器。下载较大，失败也不影响其他功能，可以以后再装。

## 第 2 步：新建 vault，或接入已有的 vault

先问用户：这是第一台电脑，还是另一台电脑上已经建好了 vault、通过 iCloud 同步过来了？

**已有 vault（第二台电脑）**：

1. 问 vault 的位置，默认是 `~/Library/Mobile Documents/iCloud~md~obsidian/Documents/我的第二大脑`。确认该目录里有 `我的设置.md`；没有的话，可能 iCloud 还没同步完，请用户稍等后再试。
2. 不要运行 `kb init`。在 vault 目录运行 `kb status` 确认能读到；处理进度（飞书游标等）在 vault 的 `.kb/state.json` 里，会随 iCloud 同步过来，不会重复拉取。
3. 跳到第 3 步。飞书凭证只存在每台电脑本机，所以这台电脑也要填一次。

**新建 vault（第一台电脑）**：

1. 问用户 vault 放在哪里。默认是 iCloud 里的 Obsidian 文件夹：`~/Library/Mobile Documents/iCloud~md~obsidian/Documents/我的第二大脑`，这样手机上的 Obsidian 也能看到。如果这个 iCloud 目录不存在，说明还没在手机或电脑上用 iCloud 打开过 Obsidian，可以先换成 `~/我的第二大脑`。
2. 运行 `kb init "<路径>"`。
   - `not_empty`：目录里已经有文件，请用户换一个空目录。
3. 告诉用户：笔记和处理进度都在 vault 里，随 iCloud 同步，所以以后在任何一台装了 kit 的电脑上都能处理收件箱；飞书凭证只留在本机。

最后提醒两件事：

- 如果开着"优化 Mac 储存空间"，iCloud 可能把不常用的文件只留在云端。建议在 Finder 里右键 vault 文件夹，选"保留下载"。
- 版本记录默认关闭。想要每次处理都留一个 git 记录，可以把 `我的设置.md` 里的 `version_history` 改成 `true`。打开前先检查 `git config user.name` 和 `git config user.email`，为空就请用户提供后用 `git config --global` 设置。每台电脑会在本机各自记录。

## 第 3 步：配置飞书（可以跳过）

问用户要不要现在接入飞书收件箱。不接入也能用：把 Web Clipper 剪藏的文件放进 vault 的 `inbox/` 即可。

要接入的话：

1. 按 `docs/TECH.md`"飞书适配器"一节，带用户在飞书开放平台完成 5 步配置（创建应用并添加机器人能力、开通 4 项权限、发布版本、把机器人拉进群、记下 App ID、App Secret 和群 ID）。
2. 在 vault 目录运行 `kb config --app-id <App ID> --app-secret <App Secret> --chat-id <群 ID>`（加 `--vault "<路径>"`，或先 `cd` 进 vault）。之后不要再复述 App Secret。
3. 运行 `kb pull --dry-run --since <今天的日期>`，确认连通。

## 第 4 步：快捷命令

问用户是否在 `~/.zshrc` 里加一个 `kb-open` 命令（进入 vault 并启动 Claude Code）。同意的话，先检查是否已经有 `kb-open`，没有才追加。`<vault 绝对路径>` 要写成以 `/Users/` 开头的完整路径（引号里的 `~` 不会展开）：

```bash
grep -q 'kb-open()' ~/.zshrc 2>/dev/null || printf '\n# second-brain-kit\nkb-open() { cd "%s" && claude; }\n' "<vault 绝对路径>" >> ~/.zshrc
```

## 第 5 步：试一次

1. 只在新建 vault 时，问用户要不要先用示例数据试一下。要的话，把 `examples/inbox/` 下的文件复制到 vault 的 `inbox/`，并提醒用户：这些是虚构示例，试完后可以把示例生成的页面、`raw/` 里的示例原文删掉（或者直接删掉整个 vault 再重新 `kb init`）。
2. 告诉用户接下来怎么用：
   - 打开一个新终端，运行 `kb-open`（或 `cd` 进 vault 后运行 `claude`），说"处理收件箱"；
   - 用 Obsidian 打开 vault 浏览结果；
   - 以后升级：在 vault 里说"升级"。

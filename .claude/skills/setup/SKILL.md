---
name: setup
description: 首次安装第二大脑。当用户在 second-brain-kit 目录里说"安装"、"开始使用"、"初始化"，或输入 /setup 时使用：检查环境、创建 vault、配置飞书（可选）、测试连通性。
---

# 首次安装

你正在 kit 仓库（second-brain-kit）里运行。全程用中文，一次只问一个问题。每一步完成后告诉用户结果，再进入下一步。

## 第 1 步：检查环境

1. 运行 `node --version`，需要 20 或以上；运行 `git --version`。缺什么就告诉用户怎么装（推荐 Homebrew：`brew install node git`），装好再继续。
2. 运行 `git config user.name` 和 `git config user.email`。如果为空，请用户提供一个名字和邮箱（只用于本地提交记录），然后用 `git config --global` 设置。
3. 在 kit 目录运行 `npm install`，再运行 `npm link`，然后运行 `kb --version` 确认命令可用。`npm link` 报权限错误时，告诉用户可以运行 `sudo npm link`。
4. 运行 `npx playwright install chromium` 安装抓取公众号等网页用的浏览器。下载较大，失败也不影响其他功能，可以以后再装。

## 第 2 步：创建 vault

1. 问用户 vault 放在哪里。默认是 iCloud 里的 Obsidian 文件夹：`~/Library/Mobile Documents/iCloud~md~obsidian/Documents/我的第二大脑`，这样手机上的 Obsidian 也能看到。如果这个 iCloud 目录不存在，说明还没在手机或电脑上用 iCloud 打开过 Obsidian，可以先换成 `~/我的第二大脑`。
2. 运行 `kb init "<路径>"`。
   - `not_empty`：目录里已经有文件，请用户换一个空目录。
   - `git_dir_exists`：这台电脑上已经装过一个 vault，问用户是否就是要用原来那个。
3. 告诉用户：笔记在 vault 里随 iCloud 同步；版本历史在 `~/.second-brain/vault.git`，不会进入 iCloud。

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

1. 问用户要不要先用示例数据试一下。要的话，把 `examples/inbox/` 下的文件复制到 vault 的 `inbox/`，并提醒用户：这些是虚构示例，试完可以回滚。回滚前先运行 `git -C "<vault>" log --oneline -3`，确认最新一次提交是处理示例的那次，再运行 `git -C "<vault>" reset --hard HEAD~1`；如果中间有用户自己的提交，不要回滚，改为手动删除示例生成的页面。
2. 告诉用户接下来怎么用：
   - 打开一个新终端，运行 `kb-open`（或 `cd` 进 vault 后运行 `claude`），说"处理收件箱"；
   - 用 Obsidian 打开 vault 浏览结果；
   - 以后升级：在 vault 里说"升级"。

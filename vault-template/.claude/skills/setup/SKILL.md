---
name: setup
description: 升级知识库系统或修改飞书配置。当用户说"升级"、"/setup --upgrade"、"更新系统文件"、"配置飞书"、"换一个飞书群"时使用。首次安装不在这里，而是在 kit 目录里运行。
---

# 升级与配置

全程用中文。kit 目录默认是 `~/second-brain-kit`；不确定时问用户。

## 升级（/setup --upgrade）

1. 运行 `git -C ~/second-brain-kit pull`，再运行 `npm --prefix ~/second-brain-kit install`。
2. 在 vault 目录运行 `kb upgrade`。它只覆盖系统文件（`CLAUDE.md`、`.claude/`、`_templates/`），`CLAUDE.md` 里"个人补充"之后的内容会原样保留，其余文件一概不动。
3. 把结果中的 `changed` 和 `removed` 告诉用户，然后运行 `kb lint` 确认没有新的 error。
4. 运行 `kb commit -m "[YYYY-MM-DD] 升级系统文件"`。
5. 提醒用户：`.claude/` 中的 skill 变化，需要重新启动 Claude Code 才会生效。

## 配置飞书

1. 如果用户还没有在飞书开放平台建好应用，按 kit 中 `docs/TECH.md`"飞书适配器"一节的 5 个步骤带用户完成。
2. 向用户要 App ID、App Secret 和收件箱群 ID（以 `oc_` 开头）。只问用户要更新的那几项。
3. 运行 `kb config --app-id <App ID> --app-secret <App Secret> --chat-id <群 ID>`。凭证只保存在本机的 `~/.second-brain/.env`，不会进入 vault，也不会同步。之后的对话里不要再复述 App Secret。
4. 运行 `kb pull --dry-run --since <今天的日期>` 测试连通性。成功时告诉用户能看到几条消息；失败时把 `message` 告诉用户，常见原因是权限没开通、版本没发布，或机器人不在群里。

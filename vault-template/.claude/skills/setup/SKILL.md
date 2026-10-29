---
name: setup
description: 升级知识库系统或修改飞书配置。当用户说"升级"、"/setup --upgrade"、"更新系统文件"、"配置飞书"、"换一个飞书群"时使用。首次安装不在这里，而是在 kit 目录里运行。
---

# 升级与配置

全程用中文。kit 目录默认是 `~/second-brain-kit`；不确定时问用户。

## 升级（/setup --upgrade）

1. 在 vault 目录运行 `kb upgrade`。它会自己完成全部步骤：
   - 在 kit 目录 `git pull` 拿到新代码，并 `npm install`；
   - 用新代码覆盖系统文件（`CLAUDE.md`、`.claude/`、`_templates/`），`CLAUDE.md` 里"个人补充"之后的内容原样保留；
   - 给 `我的设置.md` 补上新版本新增的字段、给 `.gitignore` 补上新增的条目，已有的值一律不改；
   - 迁移旧版本的数据。
2. 把结果告诉用户：`kit.updated`（有没有新版本）、`changed`、`removed`、`added`、`migrated`。
3. 如果返回 `kit_update_failed`：通常是用户改过 kit 目录里的文件，`git pull` 无法自动合并。把 `message` 原样告诉用户，不要替用户丢弃修改；用户处理好之后再运行一次 `kb upgrade`。
4. 运行 `kb lint` 确认没有新的 error，再运行 `kb commit -m "[YYYY-MM-DD] 升级系统文件"`（没有打开版本记录时跳过）。
5. 如果用户有两台电脑，提醒另一台电脑也运行一次 `kb upgrade`，以更新那台电脑上的 kit 代码。vault 的系统文件已经随 iCloud 同步过去，不会被重复修改。
6. 提醒用户：`.claude/` 中的 skill 变化，需要重新启动 Claude Code 才会生效。

## 配置飞书

1. 如果用户还没有在飞书开放平台建好应用，按 kit 中 `docs/TECH.md`"飞书适配器"一节的 5 个步骤带用户完成。
2. 向用户要 App ID、App Secret 和收件箱群 ID（以 `oc_` 开头）。只问用户要更新的那几项。
3. 运行 `kb config --app-id <App ID> --app-secret <App Secret> --chat-id <群 ID>`。凭证只保存在本机的 `~/.second-brain/.env`，不会进入 vault，也不会同步。之后的对话里不要再复述 App Secret。
4. 运行 `kb pull --dry-run --since <今天的日期>` 测试连通性。成功时告诉用户能看到几条消息；失败时把 `message` 告诉用户，常见原因是权限没开通、版本没发布，或机器人不在群里。

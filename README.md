# 同频 · 家庭成长工作台

在线版 **V0.4**。本仓库只保存公开的应用代码；家庭成长数据已迁移到私有仓库 `sunkai-hit/family-growth-data`。

## V0.4 安全模型

未授权设备只能看到设备授权页面，不能调用家庭数据 API，也不会加载任何成长总览、对话、记录、趋势、计划或报告数据。

首次使用一台浏览器设备时：

1. 浏览器在本地生成 ECDSA P-256 设备密钥；私钥留在当前浏览器 IndexedDB 中，不上传。
2. 用户输入 `WORKBENCH_WRITE_KEY`，只用于发起一次设备授权申请，不再作为日常读写凭证。
3. Cloudflare 将申请写入 D1，并归档到私有仓库 `auth/requests/FG-XXXX-XXXX.json`。
4. 用户在 ChatGPT 中发送“授权设备 FG-XXXX-XXXX”。
5. ChatGPT 从私有仓库读取申请并把状态改为 `approved`。
6. 网站检测到批准后，以浏览器私钥完成挑战签名；Cloudflare 仅在公钥验签成功后签发 1 小时会话。
7. 后续重新打开同一浏览器时，会自动使用本地私钥重新验证，不需要每天输入编辑码或重新找 GPT 授权。

清除浏览器站点数据、换浏览器或换设备，会被视为新设备，需要重新授权。

## 数据仓库

公开仓库 `family-growth`：代码、Cloudflare Pages Functions、样式和数据库结构说明。

私有仓库 `family-growth-data`：

```text
workbench/
  workbench.json
records/
  index.json
  YYYY/
    MM.json
auth/
  requests/
    FG-XXXX-XXXX.json
  devices/
    <device-id>.json
```

- `workbench/workbench.json`：ChatGPT 同步的对话、观察、计划和分析报告。
- `records/index.json`：月度记录索引。
- `records/YYYY/MM.json`：网站录入的学校作业、额外作业、成绩、老师反馈和计划进度。
- `auth/requests/`：待 GPT 人工确认的设备申请。
- `auth/devices/`：已授权/撤销设备的公开密钥与状态；不保存私钥。

D1 仍是网站的查询与趋势分析数据库；GitHub 私有仓库承担长期归档和 ChatGPT 读取。

## Cloudflare Secret

Pages 项目需要：

- `GITHUB_TOKEN`：Fine-grained personal access token，仅需授权私有仓库 `family-growth-data`，Repository permissions → Contents: Read and write。
- `WORKBENCH_WRITE_KEY`：首次发起设备申请时使用的编辑码。

**V0.4 起 Cloudflare 运行时不再需要写入公开 `family-growth` 仓库。** 为最小权限，建议把现有 Fine-grained token 的 Repository access 改为只选择 `family-growth-data`。

Token、编辑码和浏览器私钥都不能写入仓库。

## API 边界

- `/api/auth/request`：编辑码正确时创建待授权设备申请。
- `/api/auth/status`：检查 GPT 是否批准，不返回家庭数据。
- `/api/auth/challenge` + `/api/auth/session`：使用设备私钥挑战签名建立短期会话。
- `/api/state`：需要有效设备会话，否则返回 401，不返回任何家庭数据。
- `/api/records`：读写均需要有效设备会话。

## 同步触发

**ChatGPT → 私有 GitHub**：只有用户明确要求“同步成长工作台”时更新。

**网站 → D1 → 私有 GitHub**：只有点击具体表单“提交”时写入；输入、查看和切换页面不会产生业务数据写入。

## 网站录入类型

- 每日学校作业
- 额外作业
- 考试成绩
- 老师反馈
- 计划完成情况

趋势分析使用固定指标：学校作业完成率、学校作业错题数、有错科目订正率、额外作业完成率、额外作业错题率、额外学习用时、考试得分率。

## 关于原公开历史

V0.4 已从公开仓库当前 `main` 分支删除家庭数据文件，并把现行数据迁入私有仓库。但 Git 本身会保存历史提交：此前曾提交到公开仓库的数据仍可能存在于旧 commit 历史中。若需要把旧历史也做彻底清理，需要单独执行一次公开仓库历史重写/敏感数据清理；这不是普通文件删除能够完成的操作。

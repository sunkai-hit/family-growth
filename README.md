# 同频 · 家庭成长工作台

在线版 V0.1。**ChatGPT 负责继续交流；GitHub 负责版本化存储；Cloudflare Pages 提供跨设备在线网站，D1 提供结构化数据索引。**

目前是只读工作台，不是假装与当前 ChatGPT 会话实时相连的独立聊天机器人。

## 一、一次性在线部署（首次需仓库所有人完成授权）

1. 登录 [Cloudflare Dashboard](https://dash.cloudflare.com/)，进入 **Workers & Pages → Create → Pages → Connect to Git**（界面名称可能略有调整）。
2. 选择 GitHub，授权 Cloudflare 访问此仓库：\`sunkai-hit/family-growth\`。
3. 使用以下配置：项目名称建议 \`family-growth\`；生产分支 \`main\`；**构建命令留空**；**构建输出目录为 \`public\`**；根目录保持默认。
4. 仓库中的 \`wrangler.toml\` 已声明 D1 绑定 \`DB\`，数据库为 \`family-growth-db\`。若 Cloudflare 没有自动识别，进入项目 Settings → Bindings，添加 D1 数据库绑定，变量名必须为 \`DB\`，数据库选择 \`family-growth-db\`，之后重新部署。以实际项目构建日志和环境配置为准。
5. 部署成功后访问 Cloudflare 分配的 \`https://<项目名>.pages.dev\`。再访问 \`/api/state\`：正常情况下会返回 \`"ok":true\`。首次访问时 Pages Function 自动建表、把版本化 JSON 数据同步到 D1，无需手工执行 SQL。

**不要在 GitHub 公开仓库上传 Token、密码、身份资料或不希望公开的内容。** 当前方案是公开展示，工作台里出现的资料均应视为公开。

## 二、代码及数据

- \`public/index.html\`、\`style.css\`、\`app.js\`：响应式工作台，包含对话档案、成长时间线、真实趋势图和计划报告。
- \`public/data/workbench.json\`：**唯一权威业务数据来源**，由 ChatGPT 按需同步或由专门调度任务更新；网页不直接写入这里。
- \`functions/api/state.js\`：Cloudflare Pages 只读接口。比较原始数据的 SHA-256，变更后事务式同步到 D1。
- \`schema.sql\`：可读数据库模式，代码中的首次自动建表逻辑与之对应。
- \`wrangler.toml\`：Pages 输出路径及已创建 D1 数据库绑定，数据库 ID 不是密钥。

\`workbench.json\` 的数据类型：

| 字段 | 用途 |
| --- | --- |
| \`conversations\` | 对话原文或摘要。必须用 \`source_kind\` 区分 \`verbatim\` 与 \`summary\`。 |
| \`observations\` | 带时间、来源的家庭观察及待验证假设。 |
| \`metrics\` | 真实量化数据（如科目成绩），不能补造数字。 |
| \`plans\` | 建议稿、已确认的计划及状态。 |
| \`reports\` | ChatGPT 形成的分析和后续建议。 |

修改 JSON 后，Cloudflare Pages 的 GitHub 集成会自动构建。网站打开、返回前台、手动刷新，以及持续打开时每五分钟会尝试获取已同步的最新数据。

## 三、数据和对话的边界

- 目前已经导入**概括性摘要**，不是此前完整对话逐字稿；未录入具体考试分数。
- 你继续在 ChatGPT 中交流，提出“同步成长工作台”时，我可在可访问范围内整理新增资料并通过 GitHub 连接更新数据。
- **不会自动获取所有未同步的 ChatGPT 消息**；定时分析只能基于已同步到 GitHub 的记录。
- 目前 API 无匿名写入功能。未来要从工作台直接提交记录，须增加身份验证、冲突解决和 GitHub 回写机制。
- 如果 D1 尚未就绪，前端会回退显示当前部署版本的静态 JSON，并明确标注“静态备份”。

## 四、费用与运行

本设计采用 GitHub 与 Cloudflare 的免费方案为目标，不需要 OpenAI API 或常开的个人电脑。实际免费额度和服务政策以各服务提供方当前公布的为准。Cloudflare 首次 GitHub 授权和网站项目关联需要账号所有人完成，后续网站代码及数据更新可通过 GitHub 执行。

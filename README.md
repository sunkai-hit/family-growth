# 同频 · 家庭成长工作台

在线版 V0.2。ChatGPT 负责持续交流和分析，GitHub 负责版本化归档，Cloudflare Pages + D1 负责跨设备在线访问和结构化记录。

## 运行结构

- \`public/\`：在线工作台前端。
- \`functions/api/state.js\`：读取最新 GitHub 对话数据并与 D1 对齐，同时返回用户录入记录。
- \`functions/api/records.js\`：只有点击网页“提交”时才调用。先写入 D1，再自动尝试把待归档记录合并写入 GitHub。
- \`public/data/workbench.json\`：ChatGPT 同步的对话、观察、计划和分析报告。
- \`data/records.json\`：网页录入的学校作业、额外作业、考试成绩和老师反馈。
- \`schema.sql\`：D1 数据结构说明。
- \`wrangler.toml\`：Pages / D1 绑定。

## 双向同步触发

**ChatGPT → GitHub**：仅当用户明确说“同步成长工作台”或明确要求同步时更新。普通聊天不会自动写入。

**网站 → D1 → GitHub**：仅在网页点击具体表单的“提交”按钮时发生。输入、切换页面、浏览记录都不会写入。

数据类 GitHub 提交使用 \`[CF-Pages-Skip]\` 前缀，从而不触发 Pages 重建。Cloudflare Pages 官方支持通过该提交前缀跳过部署。代码变更才正常部署。

## 网站录入类型

1. 每日学校作业：按科目记录完成情况、题量、完成数、错题数、题型/知识点、订正情况和用时。
2. 额外作业：科目、内容、计划/完成题量、错题、用时、独立程度。
3. 考试成绩：一次考试可录入多科成绩、满分、错题数、主要错因及可选排名。
4. 老师反馈：科目/来源、反馈类型、反馈内容和后续处理。

趋势页会从真实记录自动派生考试得分率、额外作业完成题量/错题率/用时、学校作业错题数/用时。只有一条数据时只展示单点说明，不强行判断趋势。

## 首次启用网站写入

Cloudflare Pages 项目需要两个 Secret：

- \`GITHUB_TOKEN\`：GitHub Fine-grained personal access token，仅授权 \`sunkai-hit/family-growth\`，Repository permissions → Contents: Read and write。
- \`WORKBENCH_WRITE_KEY\`：用户自己设置的一段编辑码。工作台公开可读，但提交新记录必须提供这个编辑码。

Cloudflare Dashboard 路径：Workers & Pages → family-growth → Settings → Variables and Secrets → Add。类型选择 Secret / Encrypt。

Secret 必须在使用它的部署之前配置。配置后重新部署一次当前 production deployment。

不要把 Token 或编辑码写进 GitHub、截图发到聊天里，或提交到任何前端文件。

## 免费额度设计

数据提交不触发 Pages 构建，因此日常使用主要消耗少量 Workers 请求、D1 行读写和 GitHub REST API 请求。一个网页提交通常产生一条 D1 业务记录（另有少量状态更新）和约两次 GitHub API 请求；失败的待归档记录会在下一次正常提交时批量补同步。

网站本身不会把记录直接“注入”某个 ChatGPT 会话。ChatGPT 后续通过 GitHub 读取 \`data/records.json\` 获取网站录入内容。

## 数据边界

此仓库当前为公开仓库。所有同步进 GitHub 的内容都应视为公开信息。系统不会自动上传姓名、学校、联系方式等未明确准备公开的资料。

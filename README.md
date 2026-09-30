# 同频 · 家庭成长工作台

在线版 V0.3。ChatGPT 负责持续交流和分析，GitHub 负责版本化归档，Cloudflare Pages + D1 负责跨设备在线访问和结构化记录。

## 运行结构

- \`public/\`：在线工作台前端。
- \`functions/api/state.js\`：读取最新 GitHub 对话数据并与 D1 对齐，同时返回用户录入记录。
- \`functions/api/records.js\`：只有点击网页“提交”时才调用。先写入 D1，再自动尝试把待归档记录合并写入 GitHub。
- \`public/data/workbench.json\`：ChatGPT 同步的对话、观察、计划和分析报告。
- `data/records/index.json`：网站记录的轻量索引，保存月份、记录数和类型统计。
- `data/records/YYYY/MM.json`：网页录入的学校作业、额外作业、考试成绩和老师反馈，按月归档。
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
5. 计划进度：在计划详情中记录日期、状态、完成度与本次进展。

趋势页使用固定指标，不再根据录入内容无限生成指标名称。当前固定指标为：学校作业完成率、学校作业错题数、有错科目订正率、额外作业完成率、额外作业错题率、额外学习用时、考试得分率；并支持按科目筛选。只有一个数据点时只展示单点，不强行判断趋势。



## V0.3 信息展示

- “成长总览”的最近讨论按一次“家长反馈 + AI 建议”合并为一条讨论，标题由家长反馈截取生成，点击进入完整详情。
- “对话档案”同样以完整讨论为单位，列表中家长反馈和 AI 建议最多各展示约 5 行，完整内容进入详情页。
- 记录台账、对话档案、成长时间线、计划和分析报告使用分页；总览中的“最近”区域仍作为有限条数的快捷预览。
- 编辑权限移动到今日记录页底部；保存后压缩为单行状态，需要修改时再展开。
- 计划详情支持持续记录完成情况，这些进度与其他网站记录一样写入 D1 并按月归档 GitHub。
- 分析报告列表保持简洁，详情页展示完整分析正文。

## GitHub 月度归档策略

D1 是网站查询和趋势分析的主业务存储；GitHub 是长期、可版本化的归档层。

```text
data/
└─ records/
   ├─ index.json
   ├─ 2026/
   │  ├─ 09.json
   │  ├─ 10.json
   │  └─ 11.json
   └─ 2027/
      └─ 01.json
```

每次网站提交只会更新记录所属月份的 JSON 和 `index.json`，不会读取、重写全部历史记录。跨月补录时会写入对应历史月份。索引中保留每月记录数、日期范围和各类型数量，方便 ChatGPT 先定位月份再读取原始数据。

## 首次启用网站写入

Cloudflare Pages 项目需要两个 Secret：

- \`GITHUB_TOKEN\`：GitHub Fine-grained personal access token，仅授权 \`sunkai-hit/family-growth\`，Repository permissions → Contents: Read and write。
- \`WORKBENCH_WRITE_KEY\`：用户自己设置的一段编辑码。工作台公开可读，但提交新记录必须提供这个编辑码。

Cloudflare Dashboard 路径：Workers & Pages → family-growth → Settings → Variables and Secrets → Add。类型选择 Secret / Encrypt。

Secret 必须在使用它的部署之前配置。配置后重新部署一次当前 production deployment。

不要把 Token 或编辑码写进 GitHub、截图发到聊天里，或提交到任何前端文件。

## 免费额度设计

数据提交不触发 Pages 构建，因此日常使用主要消耗少量 Workers 请求、D1 行读写和 GitHub REST API 请求。一个网页提交通常产生一条 D1 业务记录（另有少量状态更新），并更新“当月 JSON + 索引 JSON”。一般约 4 次 GitHub REST 请求（读取/写入当月文件与索引）；失败的待归档记录会在下一次正常提交时批量补同步。即使日常每天多次提交，也远低于免费额度。

网站本身不会把记录直接“注入”某个 ChatGPT 会话。ChatGPT 后续先读取 GitHub 的 `data/records/index.json` 判断需要哪些月份，再按需读取 `data/records/YYYY/MM.json`。

## 数据边界

此仓库当前为公开仓库。所有同步进 GitHub 的内容都应视为公开信息。系统不会自动上传姓名、学校、联系方式等未明确准备公开的资料。

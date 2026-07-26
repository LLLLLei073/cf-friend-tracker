# 代码审查报告 · 2026-07-26

审查范围：本次 AI 分析 / 报告导出 / 自动更新 / 更新日志 相关改动
涉及文件：`src/main/ai.ts`、`src/main/ipc-handlers.ts`、`src/main/updater.ts`、`src/main/store.ts`、`src/preload/index.ts`、`src/renderer/src/pages/Teams.tsx`、`Settings.tsx`、`components/ChangelogModal.tsx`、`App.tsx`、`shared/types.ts`、`package.json`

## ✅ 做得好的地方
- **无 XSS 风险**：全仓库无 `dangerouslySetInnerHTML` / `innerHTML`。AI 返回的文本、更新说明均作为 React 文本节点渲染，自动转义。
- **AI 返回 JSON 解析健壮**：`parseAIJSON` 依次尝试直接解析 → 去 ```json 代码块 → 截取首尾大括号，容错性好；`coerceTeamAIResult` 对所有字段做类型兜底，单条缺字段不会整体崩溃。
- **历史记录有上限**：`addTeamAIResult` 限制最多 20 条，避免无限增长。
- **首屏写入保护**：`Settings.tsx` 用 `firstLoadRef` 跳过首次加载的自动回写，避免在 EPERM 环境下无意义写盘。
- **报错信息友好**：`extractAIError` 区分 401/403/404/429，给用户可读提示。

## 🟡 中等（已全部于 2026-07-26 修复，待发布）

> 修复实现见各文件最新代码，已通过 `npm run build`。改动尚未 commit/发包，当前版本号仍为 1.2.4；若发布按约定为补丁 → 1.2.5。

状态速览：
- #1 APP_VERSION 硬编码 → 已改为 `app:getVersion()` IPC，渲染端统一取真实版本 ✅
- #2 时间戳做删除键 → 已加 `id: string`(crypto.randomUUID)，删除/React key 改用 id ✅
- #3 xlsx 依赖 → 已在 `electron.vite.config.ts` 显式 external，require 加容错 ✅
- #4 读已存值而非编辑值 → `testConnection`/`analyzeTeam` 接收 settings 参数，渲染端传编辑/最新值 ✅

### 1. `APP_VERSION` 硬编码在 `App.tsx`，与 `package.json` 双源易漂移
`src/renderer/src/App.tsx:19` 写死 `const APP_VERSION = '1.2.4'`，而设置页“当前版本”用的是 `app.getVersion()`（来自 package.json）。本次发布就发生过 `APP_VERSION` 停留在 `1.1.0` 导致自动弹窗指向错误版本的问题。
**建议**：新增一个 IPC `app:getVersion` 返回 `app.getVersion()`，渲染端统一用 store/preload 拿到的版本，删掉硬编码常量，杜绝漂移。

### 2. 删除历史记录以 `generatedAt` 为键，同一毫秒生成会误删
`store.ts:214` `removeTeamAIResult(teamId, generatedAt)` 与 `Teams.tsx:161` 都用时间戳做唯一标识。`coerceTeamAIResult` 里 `generatedAt = Date.now()`，若用户快速重复生成（或同一 ms 内），两条记录时间戳相同，删除一条会把两条都删掉。
**建议**：给每条 `TeamAIResult` 加稳定 `id`（如 `crypto.randomUUID()` 或 `model + hash(analysis)`），用 `id` 做删除/React key。

### 3. `require('xlsx')` 运行时动态加载，依赖打包正确性
`ai.ts:408` `const XLSX = require('xlsx')`。该包在 `dependencies` 中，electron-builder 会打包，但动态 require 在 asar 内能否解析依赖 electron-vite 的 external 配置。1.2.4 构建已成功，但**未实测导出 Excel 是否在生产包中真能运行**。
**建议**：在打包后的应用里实测一次“导出 Excel”；或在 `electron.vite.config` 显式把 `xlsx` 标记为 external，确保运行时不缺失。

### 4. “测试连接 / 生成分析”读取的是已保存的 store，不是编辑中的内存值
`ai:testConnection` / `ai:analyzeTeam` 在 main 进程重新 `store.getSettings()` 读盘。`Settings.tsx` 的自动保存依赖 `aiApiKey` 等字段变更触发，若用户刚改完 Key 立刻点“测试连接”，可能测到旧值。
**建议**：把当前编辑中的 `settings` 作为参数传给 IPC（`testConnection(settings)` / `analyzeTeam(teamId, settings)`），避免依赖自动保存时序。

## 🟢 低优先级 / 信息项

> 状态速览（2026-07-26 修复并验证）：
> - #5 `extractAIError` 兜底 → 改为 `e instanceof Error ? e.message : String(e)` ✅
> - #6 `exportReport` filters 冗余三元 → 简化为始终追加「所有文件」一项 ✅
> - #7 更新说明纯文本 → 新增安全 `Markdown` 组件（不依赖 dangerouslySetInnerHTML，链接仅允许 http(s)），设置页更新说明改用它渲染 ✅
> - #8 AI Key 明文存 electron-store → **未处理**（桌面应用可接受，信息项，需时再引入 keytar）
> - #9 `files` 包含整个 node_modules → 改为只列 `out/**/*` + `package.json`，由 electron-builder 自动裁剪 devDependencies；已实测 asar 仅含生产依赖（typescript/electron-builder/vite/vitest 均被排除）✅

### 5. `extractAIError` 兜底返回 `undefined`
`ai.ts:32` `return (e as Error).message;` —— 若抛出的是字符串（如 `throw '网络错误'`），`.message` 为 `undefined`，前端显示“undefined”。
**建议**：`return e instanceof Error ? e.message : String(e);`

### 6. `ai:exportReport` 的 filters 三元表达式是冗余的
`ipc-handlers.ts:486-488` 两个分支都生成 `[{name:'所有文件', extensions:['*']}]`，可简化为无条件追加一项。

### 7. 更新说明以纯文本渲染
`Settings.tsx:471` `{updateInfo.releaseNotes}` 是纯文本，若 release notes 含 Markdown 不会渲染（安全但不够美观）。如需美化可在前端用轻量 markdown 渲染器（注意仍要转义，不要直接 `dangerouslySetInnerHTML`）。

### 8. AI API Key 以明文存于 electron-store
桌面应用可接受，但属于本地明文。若未来在意，可提示用户或结合系统凭据库（如 `keytar`）。

### 9. 打包 `files` 包含整个 `node_modules`
`package.json:49` `node_modules/**/*` 会把所有依赖（含 xlsx 的测试目录等，已用 `!` 排除部分）打进 asar。当前可用，但包体偏大；可按需收窄到实际运行时依赖。

## 总结
- 无崩溃级 / 安全级严重问题（之前的更新日志崩溃已在 1.2.4 修复）。
- 优先处理 **#1（版本号漂移）** 和 **#2（时间戳做唯一键）**，二者都可能在下次发布/使用中产生“看似正常但行为不对”的隐患。
- 生产环境建议实测一次 Excel 导出（#3）。

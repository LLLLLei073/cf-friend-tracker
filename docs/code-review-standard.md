# CF Friend Tracker — 代码审查标准与流程

> 制定人：Code Review Expert（火眼眼）
> 适用仓库：`cf-friend-tracker`（Electron + React + TypeScript，electron-vite 单体）
> 目标：把"质量参差不齐"收敛为可预期、可教学、可自动卡点的工程秩序。

---

## 0. 现状扫描（本次实测，非套模板）

| 维度 | 现状 | 评价 |
|------|------|------|
| 类型纪律 | `src` 内 **0** 处 `as any` / `@ts-ignore` | ✅ 优秀，保持 |
| 密钥处理 | `aiApiKey` / `nowcoderCookie` 走 keytar；`getSettings()` 已 mask cookie 明文 | ✅ 正确做法 |
| IPC 错误传播 | handler 抛错，渲染层剥 `Error invoking remote method` 前缀 | ✅ 一致、可控 |
| 异步清理 | effect 普遍用 `cancelled` 标志防竞态/泄漏 | ✅ 良好 |
| 限流 | CF/洛谷/牛客请求走 `RequestQueue` | ✅ 良好 |
| **Linter/Formatter** | **无 ESLint、无 Prettier** | 🔴 缺口 |
| **CI 门禁** | **无 `.github/workflows`，无自动校验** | 🔴 缺口 |
| **测试覆盖** | 5 个测试文件（cf/luogu/nowcoder API + store + rank）；**渲染层组件几乎无单测** | 🟡 缺口 |
| **HTML 净化** | `ProblemView.tsx` 手搓 3 条正则净化器 | 🔴 XSS 风险（详见 §4） |
| CSP | Electron 渲染进程未见内容安全策略 | 🟡 建议加固 |

**结论**：问题不在"会不会写 TS"，而在**缺少统一标尺与自动门禁**，导致不同文件风格/健壮性漂移。本标准据此定制。

---

## 1. 审查原则

1. **教学而非守门**：每条意见都解释 *为什么*，并给 *可执行的改法*。
2. **三级优先级**，全程统一使用：
   - 🔴 **Blocker（合入前必清）**：安全漏洞、数据丢失/损坏、竞态/死锁、破坏契约、关键路径无错误处理、关键数据通路无测试。
   - 🟡 **Should-fix（应修，可协商）**：输入校验缺失、命名/可读性差、重要行为缺测试、性能隐患、可抽提取的重复。
   - 💭 **Nit（锦上添花）**：无 linter 时的风格、文档/注释缺口、次要命名。
3. **一次给全**：一个 PR 一轮给完所有意见，不分段 drip-feed。
4. **先夸后批**：明确点名好的实践（见 §0 的 ✅），让标准有正反馈。

---

## 2. 分层审查标准（按 Electron 三层架构）

### 2.1 主进程 `src/main`
- **IPC 契约稳定**：handler 名 / 参数 / 返回值变更必须同步 `preload` + `shared/types` + 所有调用方；破坏性改动在 PR 描述里高亮。
- **错误不吞**：`ipcMain.handle` 内部异常应抛出（由渲染层统一处理），不要静默 `catch` 后返回 `undefined` 掩盖故障。
- **密钥零明文落盘**：新增敏感字段一律走 keytar；`electron-store` 只存非敏感配置；`getSettings()` 这类返回必须 mask 密钥（cookie / apiKey）。
- **并发安全**：刷新/批量抓取等有并发入口的逻辑需去重或加锁，防止重复触发打爆接口。
- **进程生命周期**：不依赖 top-level await 阻断启动；退出时释放资源（ BrowserWindow、定时器）。

### 2.2 预加载 `src/preload`
- **最小暴露面**：`contextBridge.exposeInMainWorld` 只挂白名单方法；**绝不** expose `require` / `ipc` / `process` / `Buffer` 等 Node 能力。
- **类型对齐**：`window.api` 的形状以 `shared/types` + `env.d.ts` 为单一事实源；新增方法必须同步三处（preload 实现、types、env.d.ts）。
- **参数透传安全**：preload 不做业务校验，但要做好参数形状守门，避免把畸形数据直接丢给主进程。

### 2.3 渲染层 `src/renderer`
- **Hook 依赖完整**：`useEffect` / `useCallback` / `useMemo` 的依赖数组要全；无依赖 effect 警惕无限循环。
- **effect 清理**：异步 effect 用 `cancelled` 标志或 `AbortController` 防卸载后 setState（本项目已普遍采用，保持）。
- **不可信 HTML 渲染**：⚠️ **禁止 `innerHTML` + 手搓正则净化**（见 §4 🔴）；若必须渲染外部 HTML，使用 `DOMPurify` 而非正则。
- **错误边界**：关键路由/页面用 `ErrorBoundary` 包裹（已存在，确保套到新页面）。
- **性能**：列表用稳定 `key`；大列表考虑虚拟化；避免每次渲染新建对象/回调导致无谓重渲（必要时 `memo` / `useMemo`）。
- **状态来源单一**：跨组件共享状态走 `useAppData` 等统一 hook，避免 prop 透传多层或散落副本。

### 2.4 共享类型 `src/shared`
- **单一事实源**：跨层复用的类型必须从 `shared/types` import，禁止在 main/preload/renderer 各自重复声明导致漂移。
- **变更同步**：改 `shared/types` 视为契约变更，需同步所有引用方并通过 `typecheck`。

---

## 3. 分类红线清单（审查时逐条过）

### 🔴 Blockers（任一存在则 PR 不得合入）
- **安全**：XSS（`innerHTML`/手搓净化/`dangerouslySetInnerHTML` 渲染不可信内容）、注入、`javascript:` URI、密钥明文落盘、IPC 越权暴露 Node 能力。
- **正确性**：破坏 IPC 契约、类型漂移、`removeFriend` 这类级联删除漏清关联缓存、竞态/死锁、未处理的关键错误路径。
- **测试**：关键数据通路（网络解析、字段映射、store 序列化）无单测。

### 🟡 Should-fix
- **输入校验**：外部/用户输入进系统前校验（例：牛客 userId 必须数字，本项目已做——保持）。
- **命名与可读性**：含糊变量名、超长函数、魔法数字。
- **测试缺口**：纯函数/解析逻辑无覆盖（参考 `tests/nowcoder-api.test.ts` 的写法）。
- **性能**：N+1 请求、未节流的频繁网络调用（已用 `RequestQueue` 的保持）、大列表无虚拟化。
- **重复代码**：可抽成工具函数的副本。

### 💭 Nits
- 无 linter 时的括号/引号/空行风格；缺失的 JSDoc/注释；次要命名。

---

## 4. 本仓库真实案例（审查时直接对照）

### 🔴 XSS — `ProblemView.tsx` 的手搓 HTML 净化器
```ts
// 现有实现（高风险）
function sanitizeHtml(html: string): string {
  return html
    .replace(/<script[\s\S]*?<\/script>/gi, '')
    .replace(/<iframe[\s\S]*?<\/iframe>/gi, '')
    .replace(/\son\w+\s*=\s*("[^"]*"|'[^']*'|[^\s>]+)/gi, '');
}
statementRef.current.innerHTML = sanitizeHtml(html);
```
**为什么是 🔴**：正则净化器存在已知绕过——
- 不拦 `javascript:` URI：`<a href="javascript:alert(1)">x</a>` 点击即执行。
- 不拦 `<object>`/`<embed>`/`<link>`/`<meta>` 等危险标签。
- 正则净化存在 **mXSS 变异绕过**（浏览器解析 innerHTML 后再序列化，可能重新引入危险结构）。
- 题面 HTML 来自外部（CF/翻译），属不可信内容，必须按不可信处理。

**改法**：引入 `dompurify`（体积小、经过审计），一行替换：
```ts
import DOMPurify from 'dompurify';
function sanitizeHtml(html: string): string {
  return DOMPurify.sanitize(html, { USE_PROFILES: { html: true } });
}
```
> 同时建议在 Electron 渲染进程加 `Content-Security-Policy`（如 `default-src 'self'` + 必要白名单）作为纵深防御。

### 🟡 测试覆盖不均
- 渲染层（`FriendRow` / `Leaderboard` / `Settings` / `AddFriend`）几乎无单测。
- **建议**：优先给"纯逻辑"补单测（解析、映射、排序、CSV 导出），UI 组件可用 `@testing-library/react` 补关键交互。参考 `tests/nowcoder-api.test.ts`：覆盖正常分支 + 抛错分支 + 边界。

### 🟡 缺 ESLint/Prettier
- 低级错误（未用变量、隐式 any、console 残留）全靠人眼，容易漂移。
- **建议**：引入 ESLint（含 `@typescript-eslint` + `eslint-plugin-security`）+ Prettier，配 `scripts.lint`，CI 卡点（见 §7）。

### 💭 `mathjax.ts` 的 `MathJax?: any`
- window 全局可改为具体类型或 `unknown` + 局部断言，减少 `any` 面。

---

## 5. 审查流程

### 5.1 角色
| 角色 | 职责 |
|------|------|
| 作者 | 自审清单（§6）+ 本地门禁全绿后开 PR |
| Reviewer | ≥1 人；🔴 项建议第二人确认；按标准给 🔴/🟡/💭 |
| Maintainer | 🔴 清零 + CI 绿 + ≥1 approve 后合入 |

### 5.2 时机
- **每个 PR 合入前必须审查**；🔴 未清零不得合入。
- 紧急 hotfix 可先合后补审查，但 24h 内必须补完并记录。

### 5.3 步骤
1. **作者自审**：对照 §6 清单；本地跑 `npm run typecheck && npm test`（lint 待 Phase 1 接入）全绿。
2. **开 PR**：用 `.github/PULL_REQUEST_TEMPLATE.md`，填「改动摘要 / 风险点 / 自测结果」。
3. **CI 自动门禁**（Phase 2）：lint + typecheck + test 全绿才允许 merge。
4. **Reviewer 评审**：按 §1–§3 给分级意见；作者改完 `re-request review`。
5. **合入条件**：≥1 approve + CI 绿 + 🔴 清零。

### 5.4 Definition of Done（合入前须满足）
- [ ] typecheck 通过，无新增 `any` / `@ts-ignore`
- [ ] 关键路径有错误处理，无静默吞异常
- [ ] 新增/改动敏感字段走 keytar，配置返回 mask 明文
- [ ] 不可信 HTML 经 DOMPurify（非手搓正则）
- [ ] 关键数据通路有单测
- [ ] 🔴 项清零，🟡 项已协商或建 follow-up issue

---

## 6. PR 自审 / 审查清单（可复制，亦见 `.github/PULL_REQUEST_TEMPLATE.md`）

**安全**
- [ ] 无 `innerHTML` / `dangerouslySetInnerHTML` 渲染不可信内容（必须用 DOMPurify）
- [ ] 无密钥/明文敏感信息进入 `electron-store` 或日志
- [ ] preload 未 expose 任何 Node 能力（`require`/`process`/`ipc`）

**正确性**
- [ ] IPC 契约变更已同步 preload + types + 调用方
- [ ] 无破坏类型、无类型漂移
- [ ] 异步/并发有去重或清理（cancelled / AbortController）
- [ ] 级联删除/缓存清理完整（如 removeFriend 清关联平台 cache）

**测试与质量**
- [ ] 关键数据通路有单测
- [ ] 无新增 `as any` / `@ts-ignore`
- [ ] 无遗留 `console.log` 调试代码

**可维护性**
- [ ] 命名清晰、函数不过长
- [ ] 重复逻辑已抽工具函数
- [ ] 必要处补注释（尤其"为什么"而非"做什么"）

---

## 7. 落地路线图（建议，非本次实施）

- **Phase 0（本周）**：采纳本标准；仓库落 `.github/PULL_REQUEST_TEMPLATE.md`；在 `package.json` 增加 `typecheck` script（`tsc -p tsconfig.node.json && tsc -p tsconfig.web.json`）。
- **Phase 1（工具）**：引入 ESLint（`@typescript-eslint` + `eslint-plugin-security`）+ Prettier；加 Husky pre-commit 跑 lint+test。
- **Phase 2（CI）**：GitHub Actions 跑 lint + typecheck + test 作为 merge 门禁；设覆盖率下限（如不低于当前）。
- **Phase 3（加固）**：DOMPurify 替换手搓净化器（§4 🔴）；补渲染层关键单测；Electron 加 CSP。

---

## 8. 附则
- 本标准随项目演进每季报修订，重大架构变更（如新增平台集成）须同步更新 §2 分层标准。
- 审查意见以"教学"为准：解释 *为什么* + 给 *怎么做*，不武断要求。

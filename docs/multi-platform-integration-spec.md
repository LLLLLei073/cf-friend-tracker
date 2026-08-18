# 多平台数据集成实现规格（洛谷 + 牛客）

> 状态：规格草案（未开始编码）
> 范围：在现有 cf-friend-tracker（CF 单平台）基础上，新增洛谷、牛客两类平台的数据接入。
> 目标版本：1.5.0（全新独立模块 → 次版本号，遵循项目发布约定）。

---

## 1. 目标与范围

- 一个人 = 一条 `Friend` 记录，可挂 CF / 洛谷 / 牛客 多个平台账号。
- 各平台数据**独立抓取、独立缓存、独立容错**，最终在 UI 层聚合并列展示。
- MVP 聚焦：**好友列表徽章 + 跨平台榜单 + AddFriend 多平台添加**。Feed / Teams / Training / VirtualContest 暂不接入（留二期）。
- 洛谷走「只读非官方 API」（成熟、稳定）；牛客走「用户 cookie + 逆向 web 接口」（脆弱，做成可降级开关）。

## 2. 平台可行性结论（落地前提）

| 平台 | 数据来源 | 是否需要登录 | 稳定性 | 处理策略 |
|---|---|---|---|---|
| 洛谷 | `www.luogu.com.cn/api/...`（非官方但文档化、稳定） | 只读一般无需 | 高 | 直接集成，复用 CF 的 RequestQueue+重试 |
| 牛客 | `ac.nowcoder.com` 内部 JSON / 页面内嵌 JSON | **需要用户自己的 session cookie** | 低（签名易变、易封） | 可开关、可降级；无 cookie 时该平台功能置灰 |

**牛客硬性约束（必须接受）**：
- 牛客**没有**公开的个人竞赛数据 API。企业版 `api.nowcoder.com/v1`（OAuth2）是招聘数据，拿不到个人 rating / 提交。
- 个人数据只能靠逆向 `ac.nowcoder.com` 接口 + 用户从浏览器复制的 session cookie（如 `_nowcoder_*`）。
- cookie 属敏感凭证：存 keytar（与 `aiApiKey` 同机制），不落明文、仅本地、不上传。
- 接口路径与签名随前端改版可能失效，UI 须明确标注「牛客数据可能随时失效，属尽力而为」。

## 2.1 实测更新（2026-08-16 · Phase 0 / 1a 真实联调）

洛谷匿名只读 API **实际范围比本节预估更窄**（已用真实请求逐接口验证）：

| 接口 | 匿名结果 | 说明 |
|---|---|---|
| `/api/user/info/{uid}` | ✅ 200 | 用户详情：通过/提交/CCF 等级/颜色/经验等 |
| `/api/user/search?keyword=` | ✅ 200 | 按用户名搜索候选，解析 uid |
| `/api/user/record/list/{uid}` | ❌ 404 | 提交记录，**需登录态** |
| `/api/contest/list` | ❌ 404 | 比赛列表，**需登录态** |

> 关键偏差：洛谷的「提交记录 / 比赛列表」接口在匿名会话下返回 404，**不是公开只读**。
> 这与「洛谷高可行」的初始判断有出入——洛谷只有 **user/info + user/search** 是匿名可读的（与牛客类似，需登录态才能拿个人深度数据）。

**对计划的收敛影响**：
- Phase 1a（本次落地）范围 = **洛谷用户数据集成**：AddFriend 洛谷 tab、好友列表洛谷徽章、跨平台榜单（洛谷 tab，按通过数排名）、刷新编排并入洛谷、store/ipc/preload 接入。✅ 已完整实现并通过 tsc + 真实取数。
- **submissions / contests 与 Contests 洛谷比赛区块**：因匿名 404 不可达，**推迟到登录态支持（keytar 存洛谷 cookie）之后**（归入 Phase 1b / 二期）。
- C3VK 反爬 cookie 握手（302 重定向→取 cookie→重试）已内置在 `luogu-api.ts` 的 `luoguGet`，真实家用 IP 通常直接 200。

### 2.1.1 实测更新（2026-08-16 · Phase 1b 牛客真实联调）

牛客的真实行为印证了「cookie 门控 + SPA 壳」的判断（已用真实无 cookie 请求验证）：

- 未登录访问 `ac.nowcoder.com` 任意个人页，服务端只返回**极简 SPA 壳 HTML**（含 `<div id="root">` 与 bundle 引用），**不内嵌任何个人数据**；个人 rating / 通过数等必须经用户自有 session cookie 走 XHR 接口（即页面运行时拉取后内嵌的 `window.__INITIAL_STATE__`）。
- 因此数据层 `nowcoder-api.ts` 采用：拉取 `/acm/contest/profile/{id}` 页面 HTML → 抽取 `window.__INITIAL_STATE__` JSON（括号配平扫描，兼容字符串内括号）→ 递归 DFS 查找第一个「含 id 类字段 + 名称类字段」的对象 → 映射为 `NowcoderUser`。该递归策略**不硬编码路径**，对牛客前端改版（字段名/结构漂移）更鲁棒；解析失败或 cookie 失效（302 到登录页）统一向上抛 `NowcoderNoCookieError` / 解析错误，由上层标记 `unavailable` 而不崩溃。
- cookie 真实值存系统凭据库 keytar（service `cf-friend-tracker`、account `nowcoderCookie`），`Settings.nowcoderCookie` 明文恒为空、`getSettings()` 永远回显空串，避免明文落盘。
- 默认 `enableNowcoder=false`，关闭时刷新编排与榜单跳过牛客；用户配置 cookie 且开启开关后才参与。AddFriend / Settings 均无公开搜索 API，改为「输入牛客数字 userId → 带 cookie 校验 → 关联」。

**对计划的收敛影响**：
- Phase 1b 已完整实现：数据层（逆向 + 递归解析 + 可降级）、store（keytar cookie + nowcoderCache + linkNowcoder）、ipc/preload 接入、AddFriend 牛客 tab、FriendRow 牛客徽章、Leaderboard 牛客 tab、Settings「我的关联账号（牛客）+ cookie 输入 + 平台开关」、Sidebar 刷新并入 nowcoder。✅ 已通过 node/web 临时 tsc 检查（0 错误）+ vitest（46 项全过，含 8 项 nowcoder-api 单测）。
- UI 已标注牛客数据脆弱（cookie 失效 / 接口变更提示 + 置灰 N/A）。

## 3. 数据模型设计（`src/shared/types.ts`）

### 3.1 平台账号标识（挂在 Friend 上）
```ts
export interface PlatformAccount {
  uid: number;   // 洛谷 uid / 牛客 userId
  name: string;  // 展示名
}

// 现有 Friend 扩展（handle 仍是主身份/显示名，保持不变）
export interface Friend {
  handle: string;            // CF handle（主身份，不变）
  alias: string;
  addedAt: number;
  starred?: boolean;
  groups?: string[];
  luogu?: PlatformAccount;   // 新增：可选
  nowcoder?: PlatformAccount;// 新增：可选
}
```

### 3.2 洛谷数据类型（草案，字段以联调时实际返回为准）
```ts
export interface LuoguUser {
  uid: number;
  name: string;
  avatar?: string;
  slogan?: string;
  passed: number;        // 通过题目数（字段名以实测为准）
  submitted: number;     // 提交题目数
  experience?: number;   // 经验值（部分接口返回）
  rating?: number;       // 赛分（若存在）
  ccfLevel?: number;
  rank?: number;
  lastActivity?: number; // 秒级时间戳（若存在）
}

export interface LuoguSubmission {
  id: number;
  pid: string;           // 题号，如 P1001
  title?: string;
  status: string;        // AC / WA / ...
  language?: string;
  time: number;          // 提交时间（秒）
}

export interface LuoguContest {
  id: number;
  name: string;
  startTime: number;     // 秒
  duration: number;      // 秒
  status: 'pending' | 'running' | 'ended';
}

// 洛谷单用户缓存
export interface LuoguCache {
  uid: number;
  info: LuoguUser;
  submissions: LuoguSubmission[];
  cachedAt: number;
}
```

### 3.3 牛客数据类型（草案，依赖逆向结果）
```ts
export interface NowcoderUser {
  id: number;
  name: string;
  avatar?: string;
  rating?: number;       // 竞赛积分/rating（字段以实测为准）
  accepted?: number;
  // 其余字段联调时补全
}

// 牛客单用户缓存（数据缺失时字段可能为 undefined）
export interface NowcoderCache {
  id: number;
  info: NowcoderUser;
  cachedAt: number;
  unavailable?: boolean; // 标记本次抓取失败/接口失效
}
```

### 3.4 设置项扩展（`Settings`）
```ts
export interface Settings {
  // ... 现有字段保持不变 ...
  // 牛客登录态（敏感，存 keytar，store 内明文留空）
  nowcoderCookie: string;
  // 平台开关：关闭后对应平台不参与刷新/展示
  enableLuogu: boolean;
  enableNowcoder: boolean;
}
```

> 注意：`nowcoderCookie` 与 `aiApiKey` 同样走 keytar 异步读写；`getSettings()` 回填空字符串，真实值由 `getApiKeyAsync` 同款机制提供（新增 `getNowcoderCookieAsync`）。

## 4. API 层设计

### 4.1 洛谷 `src/main/luogu-api.ts`
复用 `cf-api.ts` 的 `RequestQueue` + `isRetryableNetworkError` + 指数退避；新增独立限速队列（洛谷建议 ~1s/次）。

```ts
const LUOGU_BASE = 'https://www.luogu.com.cn/api';
const LUOGU_UA = 'Mozilla/5.0 (cf-friend-tracker)'; // 真实 UA，避免被反 bot 直接拦

// 统一请求：GET + _contentOnly=1 + 真实 UA + 重试退避
async function luoguGet<T>(path: string, params: Record<string,string>): Promise<T>;

// 按名字搜索用户，返回候选列表（取第一个或让用户选）
export async function searchLuoguUser(name: string): Promise<PlatformAccount[]>;

// 拉取用户详情（通过题数/经验/rating 等）
export async function fetchLuoguUserDetail(uid: number): Promise<LuoguUser>;

// 拉取近期提交（默认 20 条，训练看板可 1000）
export async function fetchLuoguSubmissions(uid: number, count?: number): Promise<LuoguSubmission[]>;

// 即将开始/进行中的比赛
export async function fetchLuoguContests(): Promise<LuoguContest[]>;

// 题目列表（刷题功能扩展用，二期）
export async function fetchLuoguProblemList(): Promise<LuoguProblem[]>;
```

**反爬对策**：所有请求带 `User-Agent`；加 `?_contentOnly=1`（或请求头 `x-lentille-request: content-only`）让洛谷返回 JSON 而非 HTML。`fetchLuoguUserDetail` 调用失败时，退化为仅存储通过 `searchLuoguUser` 得到的基础信息（与 CF 的 `refreshUserCacheSafe` 同思路）。

**题面抓取**：洛谷题面页同样有反爬，`problem:openInBrowser` 模式可复用到 `luogu.com.cn/problem/{pid}`——未缓存时提示浏览器打开，不强行应用内抓取。

### 4.2 牛客 `src/main/nowcoder-api.ts`
```ts
const NC_BASE = 'https://ac.nowcoder.com';

// cookie 由设置注入；无 cookie 时所有函数直接抛 "NO_COOKIE"
async function ncGet<T>(path: string, cookie: string): Promise<T>;

// 拉取用户竞赛资料（rating/通过数等，字段以逆向结果为准）
export async function fetchNowcoderUser(id: number, cookie: string): Promise<NowcoderUser>;

// 牛客竞赛列表（月赛/练习赛等，多为公开页）
export async function fetchNowcoderContests(): Promise<NowcoderContest[]>;
```

**实现要点**：
- 精确接口路径在编码期用浏览器 Network 面板确认（如 `acm/contest/profile/{id}` 或内嵌 `window.__INITIAL_STATE__`）。
- 全部调用 **failure-tolerant**：抛错或返回空 → 标记 `NowcoderCache.unavailable = true`，不阻断其它平台与用户。
- cookie 失效（401/重定向登录页）→ 标记不可用并提示用户在设置里更新 cookie。

## 5. 存储层设计（`src/main/store.ts`）

`StoreSchema` 新增：
```ts
type StoreSchema = {
  // ... 现有字段 ...
  luoguCache: Record<number, LuoguCache>;     // key = uid
  nowcoderCache: Record<number, NowcoderCache>;// key = id
};
```
新增方法（与现有 `cache` 对称）：
- `getLuoguCache(uid)` / `setLuoguCache(uid, data)` / `getAllLuoguCache()`
- `getNowcoderCache(id)` / `setNowcoderCache(id, data)` / `getAllNowcoderCache()`
- `removeFriend` 同时清理三个平台的缓存 key。

`exportAll()` / `importAll()`：把 `luoguCache` / `nowcoderCache` 一并序列化；`nowcoderCookie` 走 keytar，不进备份 JSON（备份仅记录「是否已配置」标志，真实 cookie 由用户本机凭据库保留）。

## 6. IPC 层设计（`src/main/ipc-handlers.ts`）

新增 handler：
```
luogu:searchUser(name)            -> PlatformAccount[]
luogu:getUserDetail(uid)          -> LuoguUser
luogu:getSubmissions(uid, count)  -> LuoguSubmission[]
luogu:getContests()               -> LuoguContest[]
nowcoder:getUser(id)              -> NowcoderUser   (需 cookie)
nowcoder:getContests()            -> NowcoderContest[]
store:linkAccount(handle, platform, account) -> bool   // 关联账号到已有 Friend
store:unlinkAccount(handle, platform)         -> bool
settings:getNowcoderCookie / setNowcoderCookie (keytar)
```

**刷新编排**（改造现有 `cf:refreshAll`）：
```ts
async function refreshAllMulti(store): Promise<RefreshSummary> {
  const friends = store.getFriends();
  const errors: string[] = [];
  // 1) CF（保持现有逻辑）
  // 2) 洛谷：仅处理带 f.luogu 的好友，逐 uid 容错刷新
  if (settings.enableLuogu) {
    for (const f of friends.filter(x => x.luogu)) {
      try { /* detail + submissions -> setLuoguCache */ }
      catch (e) { errors.push(`洛谷 ${f.luogu!.name}: ${e}`); }
      sendProgress({ platform: 'luogu', ... });
    }
  }
  // 3) 牛客：仅当 enableNowcoder 且已配置 cookie
  if (settings.enableNowcoder && cookie) {
    for (const f of friends.filter(x => x.nowcoder)) {
      try { /* fetchNowcoderUser -> setNowcoderCache */ }
      catch (e) { store.setNowcoderCache(id, { unavailable: true, ... }); errors.push(...); }
      sendProgress({ platform: 'nowcoder', ... });
    }
  }
  // 4) 通知/lastRefreshAt（同现有）
  return { errors, ... };
}
```
`RefreshProgress` 增加可选 `platform?: 'cf'|'luogu'|'nowcoder'` 字段，前端进度条按平台分组或合并显示。

## 7. 渲染层设计

### 7.1 聚合视图（新增 `useAppData` 内或独立 `src/renderer/src/utils/unified.ts`）
```ts
export interface UnifiedFriendView {
  friend: Friend;
  cf?: FriendCache;
  luogu?: LuoguCache;
  nowcoder?: NowcoderCache;
}
// 由 getAllCache / getAllLuoguCache / getAllNowcoderCache 按 handle/uid/id 聚合
```

### 7.2 组件改动清单
| 组件 | 改动 |
|---|---|
| `AddFriend.tsx` | 支持三种添加方式：CF handle / 洛谷名（调用 `luogu:searchUser` 选 uid）/ 牛客 ID；并支持「关联到已有好友」（`store:linkAccount`）。 |
| `FriendRow.tsx` | 在 CF rating 旁增加平台徽章：洛谷「通过数 / 经验」，牛客「rating」（不可用时显示灰化「N/A」）。 |
| `FriendList.tsx` | 聚合 `UnifiedFriendView`；徽章按 `enableLuogu/enableNowcoder` 显隐。 |
| `Leaderboard.tsx` | 跨平台榜单：按平台分组，各平台内独立排名（CF rating / 洛谷通过数 / 牛客 rating），并排展示，不做强行归一。 |
| `Settings.tsx` | 新增「牛客 session cookie」输入框（密码框）+ 洛谷/牛客平台开关 + 失效提示文案。 |
| `Sidebar.tsx` | 如需，可加平台筛选；MVP 可不动。 |

`Feed / Teams / Training / VirtualContest`：MVP **不接入**，留二期（Phase 3）。

## 8. 错误处理与降级

- 单平台调用失败 → 仅该平台数据缺失，不影响其它平台与整体刷新。
- 洛谷：详情失败退化为基础信息；被反爬拦截 → 提示「在浏览器打开洛谷」。
- 牛客：无 cookie → 功能置灰并提示配置；cookie 失效 → 标记 `unavailable` 并提示更新；接口结构变更导致解析失败 → 捕获后标记不可用，不 crash。
- 所有平台统一「强缓存 + 限速 + 重试」，失败以旧缓存兜底展示。

## 9. 测试计划

- `tests/` 新增：
  - `luogu-api.test.ts`：mock axios 验证 `searchLuoguUser` / `fetchLuoguUserDetail` 解析与重试逻辑（参考现有 tests 结构）。
  - `nowcoder-api.test.ts`：验证「无 cookie 抛 NO_COOKIE」「解析失败标记 unavailable」分支。
  - `store.test.ts`：验证 `luoguCache/nowcoderCache` 读写与 `removeFriend` 三平台清理。
- 联调：Phase 0 用真实网络验证 `fetchLuoguUserDetail` 可取数；Phase 1b 用真实 cookie 验证牛客可取数（仅在本地、不上传 cookie）。

## 10. 分阶段 Checklist

**Phase 0 — 架构验证（小更新 1.4.x）**
- [ ] `shared/types.ts`：加 `PlatformAccount`/`LuoguUser`/`LuoguCache` 等草案类型。
- [ ] `luogu-api.ts`：实现 `searchLuoguUser` + `fetchLuoguUserDetail`，打通一个真实调用。
- [ ] 本地（dev）验证能取到洛谷用户数据。

**Phase 1a — 洛谷完整集成（→ 1.5.0）**
- [ ] `luogu-api.ts`：补齐 submissions / contests / problemList。
- [ ] `store.ts`：luoguCache 表 + 方法 + 备份序列化。
- [ ] `ipc-handlers.ts`：luogu:* handler + 刷新编排并入多平台。
- [ ] 渲染：AddFriend（洛谷）、FriendRow 徽章、Leaderboard 跨平台、Settings 开关。
- [ ] 测试 + `tsc` 全量通过。

**Phase 1b — 牛客集成（1.5.x / 可降级）**
- [x] `nowcoder-api.ts`：逆向接口 + cookie 注入 + 容错（递归解析 `__INITIAL_STATE__`，NO_COOKIE/解析失败可降级）。
- [x] `store.ts`：nowcoderCache + keytar cookie。
- [x] `ipc-handlers.ts`：nowcoder:* handler + 刷新编排。
- [x] 渲染：AddFriend（牛客）、FriendRow 徽章、Settings cookie 输入 + 失效提示。
- [x] 明确 UI 标注「牛客数据脆弱」。

**Phase 3（二期，本次不做）**：跨平台 Feed、Teams AI 跨平台分析、Training 合并、VirtualContest 支持牛客/洛谷比赛。

## 11. 版本与发布

- 两平台属全新独立模块 → 次版本号 **1.5.0**（依项目发布约定）。
- 「更新」= 完整发版（commit/push + GitHub Release + 更新日志），非仅运行。
- 牛客因脆弱性，发版说明中标注「牛客数据依赖用户自有 cookie，可能随官网改版失效」。

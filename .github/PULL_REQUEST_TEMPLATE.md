# PR 描述

## 改动摘要
<!-- 这个 PR 做了什么？为什么做？ -->

## 风险点 / 影响面
<!-- 是否改动 IPC 契约、类型、存储结构、密钥？是否需要迁移？ -->

## 自测结果
<!-- 本地门禁：npm run typecheck && npm test；手动验证了哪些路径？ -->

---

## 自审 / 审查清单

### 安全 🔴
- [ ] 无 `innerHTML` / `dangerouslySetInnerHTML` 渲染不可信内容（必须用 DOMPurify）
- [ ] 无密钥/明文敏感信息进入 `electron-store` 或日志
- [ ] preload 未 expose 任何 Node 能力（`require` / `process` / `ipc`）

### 正确性 🔴
- [ ] IPC 契约变更已同步 preload + types + 调用方
- [ ] 无破坏类型、无类型漂移
- [ ] 异步/并发有去重或清理（cancelled / AbortController）
- [ ] 级联删除/缓存清理完整（如 removeFriend 清关联平台 cache）

### 测试与质量 🟡
- [ ] 关键数据通路有单测
- [ ] 无新增 `as any` / `@ts-ignore`
- [ ] 无遗留 `console.log` 调试代码

### 可维护性 💭
- [ ] 命名清晰、函数不过长
- [ ] 重复逻辑已抽工具函数
- [ ] 必要处补注释（尤其"为什么"而非"做什么"）

---

## Reviewer 意见区
<!-- 审查分级：🔴 Blocker / 🟡 Should-fix / 💭 Nit -->
<!-- 每条意见解释 why + 给 how -->


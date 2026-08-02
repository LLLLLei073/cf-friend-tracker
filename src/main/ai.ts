import axios from 'axios';
import { randomUUID } from 'crypto';
import type {
  FriendCache,
  Settings,
  TeamAIResult,
  AIProblemSet,
  AIKnowledgePoint,
  AIConnectionResult,
  CFSubmission,
} from '../shared/types';
// OpenAI 兼容的 chat completions 端点
const CHAT_PATH = '/chat/completions';
const REQUEST_TIMEOUT = 90000; // AI 生成可能较慢, 给 90s

function normalizeBase(base: string): string {
  return (base || '').trim().replace(/\/+$/, '');
}

/** 从 axios / 普通错误中提取人类可读信息 */
function extractAIError(e: unknown): string {
  if (axios.isAxiosError(e)) {
    const data = e.response?.data as
      | { error?: { message?: string }; message?: string }
      | undefined;
    const msg = data?.error?.message || data?.message || e.message;
    const status = e.response?.status;
    if (status === 401 || status === 403) return `认证失败 (HTTP ${status}): ${msg}`;
    if (status === 404) return `接口不存在 (HTTP 404): 请检查 API 地址是否正确`;
    if (status === 429) return `请求过于频繁或额度不足 (HTTP 429): ${msg}`;
    return status ? `HTTP ${status}: ${msg}` : `网络错误: ${msg}`;
  }
  return e instanceof Error ? e.message : String(e);
}

/** 健壮地从 AI 文本回复中提取 JSON 对象 */
function parseAIJSON(text: string): unknown {
  const trimmed = text.trim();
  // 1. 直接解析
  try {
    return JSON.parse(trimmed);
  } catch {
    /* 继续尝试 */
  }
  // 2. 去掉 ```json ... ``` 代码块
  const fence = trimmed.match(/```(?:json)?\s*([\s\S]*?)```/);
  if (fence) {
    try {
      return JSON.parse(fence[1].trim());
    } catch {
      /* 继续尝试 */
    }
  }
  // 3. 截取第一个 { 到最后一个 }
  const start = trimmed.indexOf('{');
  const end = trimmed.lastIndexOf('}');
  if (start >= 0 && end > start) {
    try {
      return JSON.parse(trimmed.slice(start, end + 1));
    } catch {
      /* 继续尝试 */
    }
  }
  throw new Error('AI 返回内容无法解析为 JSON');
}

function asString(v: unknown, fallback = ''): string {
  return typeof v === 'string' ? v : fallback;
}

function asStringArray(v: unknown): string[] {
  return Array.isArray(v) ? v.map((x) => String(x)).filter(Boolean) : [];
}

/** 校验并把任意对象规整为 TeamAIResult */
function coerceTeamAIResult(raw: unknown, model: string): TeamAIResult {
  const obj = (raw ?? {}) as Record<string, unknown>;
  const problemSets: AIProblemSet[] = Array.isArray(obj.problemSets)
    ? obj.problemSets.map((p) => {
        const ps = (p ?? {}) as Record<string, unknown>;
        return {
          title: asString(ps.title, '未命名题单'),
          topic: asString(ps.topic),
          difficulty: asString(ps.difficulty),
          reason: asString(ps.reason),
          problems: asStringArray(ps.problems),
        };
      })
    : [];
  const knowledgePoints: AIKnowledgePoint[] = Array.isArray(obj.knowledgePoints)
    ? obj.knowledgePoints.map((k) => {
        const kp = (k ?? {}) as Record<string, unknown>;
        const priority = asString(kp.priority, 'medium');
        return {
          topic: asString(kp.topic, '未命名知识点'),
          description: asString(kp.description),
          members: asStringArray(kp.members),
          priority:
            priority === 'high' || priority === 'low' ? priority : 'medium',
        };
      })
    : [];
  return {
    id: randomUUID(),
    analysis: asString(obj.analysis, '(AI 未返回分析内容)'),
    problemSets,
    knowledgePoints,
    generatedAt: Date.now(),
    model,
  };
}

/** 发起一次 chat completions 请求, 返回助手消息文本 */
async function chatComplete(
  settings: Settings,
  messages: { role: string; content: string }[],
  options: { maxTokens?: number; temperature?: number } = {}
): Promise<string> {
  const base = normalizeBase(settings.aiApiBase);
  if (!base) throw new Error('未配置 API 地址');
  if (!settings.aiApiKey) throw new Error('未配置 API Key');
  if (!settings.aiModel) throw new Error('未配置模型名称');

  const url = `${base}${CHAT_PATH}`;
  const body: Record<string, unknown> = {
    model: settings.aiModel,
    messages,
    temperature: options.temperature ?? 0.5,
  };
  if (options.maxTokens) body.max_tokens = options.maxTokens;

  const resp = await axios.post(url, body, {
    headers: {
      Authorization: `Bearer ${settings.aiApiKey}`,
      'Content-Type': 'application/json',
    },
    timeout: REQUEST_TIMEOUT,
  });

  const content = resp.data?.choices?.[0]?.message?.content;
  if (typeof content !== 'string' || !content.trim()) {
    throw new Error('AI 返回内容为空');
  }
  return content;
}

/** 测试 AI 接口连通性 */
export async function testAIConnection(settings: Settings): Promise<AIConnectionResult> {
  if (!settings.aiApiBase || !settings.aiApiKey || !settings.aiModel) {
    return { ok: false, error: '请先填写 API 地址、API Key 和模型名称' };
  }
  try {
    const content = await chatComplete(
      settings,
      [{ role: 'user', content: '请只回复两个字: ok' }],
      { maxTokens: 16, temperature: 0 }
    );
    return { ok: true };
  } catch (e) {
    return { ok: false, error: extractAIError(e) };
  }
}

// ---- 成员数据摘要 ----

/** 难度区间计数 */
function difficultyBreakdown(subs: CFSubmission[]): string {
  const buckets = [
    { label: '未标级', count: 0 },
    { label: '<1200', count: 0 },
    { label: '1200-1399', count: 0 },
    { label: '1400-1599', count: 0 },
    { label: '1600-1899', count: 0 },
    { label: '1900-2099', count: 0 },
    { label: '2100-2399', count: 0 },
    { label: '2400+', count: 0 },
  ];
  const acKeys = new Set<string>();
  for (const s of subs) {
    if (s.verdict !== 'OK' || !s.problem.contestId) continue;
    const key = `${s.problem.contestId}-${s.problem.index}`;
    if (acKeys.has(key)) continue;
    acKeys.add(key);
    const r = s.problem.rating ?? 0;
    if (r === 0) buckets[0].count++;
    else if (r < 1200) buckets[1].count++;
    else if (r < 1400) buckets[2].count++;
    else if (r < 1600) buckets[3].count++;
    else if (r < 1900) buckets[4].count++;
    else if (r < 2100) buckets[5].count++;
    else if (r < 2400) buckets[6].count++;
    else buckets[7].count++;
  }
  const nonZero = buckets.filter((b) => b.count > 0);
  if (nonZero.length === 0) return '无 AC 记录';
  return nonZero.map((b) => `${b.label}:${b.count}`).join(', ');
}

/** 标签通过率摘要 (弱项识别) */
function tagSummary(subs: CFSubmission[]): string {
  const problemBest = new Map<string, boolean>(); // true = AC
  const tagMap = new Map<string, { ac: number; total: number }>();
  for (const s of subs) {
    if (!s.problem.contestId) continue;
    const key = `${s.problem.contestId}-${s.problem.index}`;
    const isAC = s.verdict === 'OK';
    if (problemBest.has(key) && problemBest.get(key)) continue;
    problemBest.set(key, isAC);
    for (const tag of s.problem.tags ?? []) {
      if (!tagMap.has(tag)) tagMap.set(tag, { ac: 0, total: 0 });
      const stat = tagMap.get(tag)!;
      stat.total++;
      if (isAC) stat.ac++;
    }
  }
  if (tagMap.size === 0) return '无标签数据';
  // 弱项: 尝试>=2 且通过率<0.5
  const weak = Array.from(tagMap.entries())
    .filter(([, v]) => v.total >= 2 && v.ac / v.total < 0.5)
    .sort((a, b) => a[1].ac / a[1].total - b[1].ac / b[1].total)
    .slice(0, 6)
    .map(([tag, v]) => `${tag}(${v.ac}/${v.total})`);
  // 强项: AC>=3 且通过率>=0.7
  const strong = Array.from(tagMap.entries())
    .filter(([, v]) => v.ac >= 3 && v.ac / v.total >= 0.7)
    .sort((a, b) => b[1].ac - a[1].ac)
    .slice(0, 6)
    .map(([tag, v]) => `${tag}(${v.ac}/${v.total})`);
  const parts: string[] = [];
  if (strong.length) parts.push(`强项: ${strong.join(', ')}`);
  if (weak.length) parts.push(`弱项: ${weak.join(', ')}`);
  return parts.length ? parts.join(' | ') : '无明显强弱项';
}

/** 将单个成员的缓存压缩为提示词用的文本摘要 */
function summarizeMember(handle: string, cache: FriendCache | undefined): string {
  if (!cache) return `### ${handle}\n暂无数据`;
  const info = cache.info;
  const subs = cache.recentSubmissions ?? [];
  const ratingHistory = cache.ratingHistory ?? [];
  const acCount = subs.filter(
    (s) => s.verdict === 'OK' && s.problem.contestId
  ).length;

  const lines: string[] = [`### ${handle}`];
  lines.push(
    `段位: ${info.rank ?? 'Unrated'} | 当前 Rating: ${info.rating ?? 'N/A'} | 最高 Rating: ${info.maxRating ?? 'N/A'}`
  );
  if (ratingHistory.length > 0) {
    const recent = ratingHistory.slice(-5).reverse();
    const trend = recent
      .map(
        (r) =>
          `${r.contestName}(delta ${r.newRating - r.oldRating >= 0 ? '+' : ''}${r.newRating - r.oldRating})`
      )
      .join(' -> ');
    lines.push(`近期比赛: ${trend}`);
  }
  lines.push(`近期提交(样本${subs.length}条, 其中 AC ${acCount} 题)`);
  lines.push(`AC 难度分布: ${difficultyBreakdown(subs)}`);
  lines.push(`知识点掌握: ${tagSummary(subs)}`);

  return lines.join('\n');
}

const SYSTEM_PROMPT = `你是一位经验丰富的算法竞赛(ICPC / Codeforces)教练。请根据队伍成员的 Codeforces 数据,给出专业、具体、可执行的分析与训练建议。

你必须只返回一个 JSON 对象,不要输出任何额外文字、解释或 markdown 代码块标记。JSON 结构如下:
{
  "analysis": "对队伍整体实力的分析,包含优势、短板与协作建议,200-400 字",
  "problemSets": [
    { "title": "题单名称", "topic": "涉及知识点", "difficulty": "难度区间如 1400-1600", "reason": "推荐理由", "problems": ["题目编号如 1234A"] }
  ],
  "knowledgePoints": [
    { "topic": "知识点", "description": "需要掌握的内容", "members": ["需要加强该知识点的成员 handle"], "priority": "high 或 medium 或 low" }
  ]
}

要求:
- problemSets 给出 3-5 个题单, 覆盖成员的弱项与进阶方向;
- knowledgePoints 给出 4-8 个知识点, members 填写需要加强该知识点的成员 handle (必须来自给定成员);
- problems 中的题目编号尽量使用真实存在的 Codeforces 题目 (contestId+index, 如 1234A); 如不确定可留空数组;
- 难度区间应匹配成员当前水平, 略高于平均 rating 以达到训练效果;
- 所有文本使用简体中文。

关于「团队目标」: 如果用户在请求中提供了团队目标, 你必须让分析与建议紧密围绕该目标展开——
- 在 analysis 中明确点明该目标, 并评估队伍当前状态距离目标的差距;
- problemSets 的推荐题单应直接服务于该目标(例如目标为「冲击 Div.2 前 500」则重点推荐比赛策略、罚时控制、高频考点题单);
- knowledgePoints 应优先列出阻碍达成该目标的知识点;
- 如果未提供目标, 则按常规给出通用训练建议。`;

/**
 * 分析一支队伍: 根据成员缓存数据调用 AI 生成分析报告、推荐题单与知识点清单。
 * @param goal 团队训练目标(可选), AI 会围绕目标给出建议与推荐题库
 */
export async function analyzeTeam(
  teamName: string,
  members: { handle: string; cache?: FriendCache }[],
  settings: Settings,
  goal?: string
): Promise<TeamAIResult> {
  if (!settings.aiApiBase || !settings.aiApiKey || !settings.aiModel) {
    throw new Error('未配置 AI 接口, 请先在设置中填写 API 地址、API Key 和模型名称');
  }

  const memberSummaries = members
    .map((m) => summarizeMember(m.handle, m.cache))
    .join('\n\n');

  const goalLine = goal && goal.trim()
    ? `\n\n团队目标: ${goal.trim()}\n请严格围绕上述目标给出分析、建议与推荐题单。`
    : '';

  const userPrompt = `队伍名称: ${teamName}\n成员数: ${members.length}\n\n以下是各成员的 Codeforces 数据摘要(基于近期提交与 rating 历史):\n\n${memberSummaries}${goalLine}\n\n请基于以上数据返回 JSON 分析结果。`;

  const content = await chatComplete(
    settings,
    [
      { role: 'system', content: SYSTEM_PROMPT },
      { role: 'user', content: userPrompt },
    ],
    { temperature: 0.6 }
  );

  const raw = parseAIJSON(content);
  return coerceTeamAIResult(raw, settings.aiModel);
}

// ---- 题面翻译 ----

/**
 * 把 CF 题面 HTML 翻译成简体中文。
 * 做法: 先把公式($$$...$$$/6个$的display公式)与 <pre> 样例块替换成占位符,
 * 只让 AI 翻译文字部分, 翻译后再还原 —— 保证公式与样例绝对不被翻译破坏。
 */
export async function translateProblemHTML(
  html: string,
  settings: Settings
): Promise<string> {
  if (!settings.aiApiBase || !settings.aiApiKey || !settings.aiModel) {
    throw new Error('未配置 AI 接口, 请先在设置中填写 API 地址、API Key 和模型名称');
  }

  // 1. 抽出不可翻译片段: display 公式(6个$) > inline 公式(3个$) > pre 块 > img/svg
  const frozen: string[] = [];
  const freeze = (s: string): string => {
    frozen.push(s);
    return `[[F${frozen.length - 1}]]`;
  };
  const prepared = html
    .replace(/\${6}[\s\S]+?\${6}|\${3}[\s\S]+?\${3}/g, freeze)
    .replace(/<pre[\s\S]*?<\/pre>/gi, freeze)
    .replace(/<img[^>]*>|<svg[\s\S]*?<\/svg>/gi, freeze);

  const system = `你是一位精通算法竞赛的专业翻译。把用户给出的 Codeforces 题面 HTML 片段翻译成简体中文。

严格遵守:
1. 保持所有 HTML 标签与属性原样不动, 只翻译标签之间的可见文字;
2. 形如 [[F0]]、[[F1]] 的占位符是公式/样例, 必须一字不差地原样保留, 不得增删、翻译或改写;
3. 术语使用竞赛惯用译法(如 test case=测试用例, constraints=数据范围, subsequence=子序列);
4. "Input"/"Output"/"Note"/"Example" 等小节标题分别译为 输入/输出/说明/样例;
5. 直接输出翻译后的 HTML, 不要任何解释、前后缀或 markdown 代码块标记。`;

  const content = await chatComplete(
    settings,
    [
      { role: 'system', content: system },
      { role: 'user', content: prepared },
    ],
    { temperature: 0.2 }
  );

  // 2. 去掉可能的代码块围栏
  let out = content.trim();
  const fence = out.match(/^```(?:html)?\s*([\s\S]*?)```$/);
  if (fence) out = fence[1].trim();

  // 3. 还原占位符; 若有占位符丢失则视为翻译失败
  // (占位符总数很少时(如仅 1 个公式)也应严格检查, 不能因阈值过宽而漏报)
  let missing = 0;
  out = out.replace(/\[\[F(\d+)\]\]/g, (_m, i) => frozen[Number(i)] ?? _m);
  for (let i = 0; i < frozen.length; i++) {
    if (!out.includes(frozen[i])) missing++;
  }
  if (missing > 0 && missing > Math.max(1, frozen.length * 0.1)) {
    throw new Error(`翻译结果不完整(丢失 ${missing} 处公式/样例), 请重试`);
  }
  return out;
}

// ---- 报告导出 ----

const PRIORITY_TEXT: Record<AIKnowledgePoint['priority'], string> = {
  high: '高',
  medium: '中',
  low: '低',
};

/** 把题目编号(如 1234A)转成 CF 题目页链接, 无法解析时返回原文 */
function problemLink(code: string): string {
  const m = code.trim().match(/^(\d+)([A-Za-z]\d?)$/);
  if (!m) return code;
  const url = `https://codeforces.com/problemset/problem/${m[1]}/${m[2]}`;
  return `[${code}](${url})`;
}

/**
 * 把一次团队 AI 分析结果整理成 Markdown 文档。
 * @param goal 团队训练目标(可选), 写入报告头部
 */
export function buildReportMarkdown(teamName: string, result: TeamAIResult, goal?: string): string {
  const lines: string[] = [];
  const genTime = new Date(result.generatedAt).toLocaleString();

  lines.push(`# ${teamName} AI 分析报告`);
  lines.push('');
  lines.push(`> 生成时间：${genTime}  `);
  lines.push(`> 使用模型：${result.model}`);
  if (goal && goal.trim()) {
    lines.push(`> 团队目标：${goal.trim()}`);
  }
  lines.push('');
  lines.push('---');
  lines.push('');

  // 一、整体分析
  lines.push('## 一、整体分析');
  lines.push('');
  lines.push(result.analysis || '(无)');
  lines.push('');

  // 二、推荐题单
  lines.push('## 二、推荐题单');
  lines.push('');
  if (result.problemSets.length === 0) {
    lines.push('(无)');
    lines.push('');
  } else {
    result.problemSets.forEach((ps, i) => {
      lines.push(`### ${i + 1}. ${ps.title}`);
      lines.push('');
      if (ps.topic) lines.push(`- **知识点**：${ps.topic}`);
      if (ps.difficulty) lines.push(`- **难度**：${ps.difficulty}`);
      if (ps.reason) lines.push(`- **推荐理由**：${ps.reason}`);
      if (ps.problems.length > 0) {
        lines.push(`- **题目**：${ps.problems.map(problemLink).join('、')}`);
      }
      lines.push('');
    });
  }

  // 三、知识点清单
  lines.push('## 三、知识点清单');
  lines.push('');
  if (result.knowledgePoints.length === 0) {
    lines.push('(无)');
    lines.push('');
  } else {
    result.knowledgePoints.forEach((kp, i) => {
      lines.push(`### ${i + 1}. ${kp.topic}（优先级：${PRIORITY_TEXT[kp.priority]}）`);
      lines.push('');
      if (kp.description) lines.push(kp.description);
      if (kp.members.length > 0) {
        lines.push('');
        lines.push(`**需加强成员**：${kp.members.join('、')}`);
      }
      lines.push('');
    });
  }

  lines.push('---');
  lines.push('');
  lines.push('*由 CF Friend Tracker 生成*');
  lines.push('');

  return lines.join('\n');
}

// ---- Excel 导出 ----

/**
 * 把一次团队 AI 分析结果整理成 .xlsx 工作簿的 Buffer。
 * 生成 4 个 sheet: 概览 / 整体分析 / 推荐题单 / 知识点清单。
 * 使用 SheetJS (xlsx), 纯内存构建, 不触碰磁盘。
 */
export function buildReportExcelBuffer(teamName: string, result: TeamAIResult, goal?: string): Buffer {
  // eslint-disable-next-line @typescript-eslint/no-var-requires
  let XLSX: typeof import('xlsx');
  try {
    XLSX = require('xlsx') as typeof import('xlsx');
  } catch (e) {
    throw new Error(`无法加载 Excel 组件(xlsx),请确认安装包完整后重试: ${(e as Error).message}`);
  }

  const wb = XLSX.utils.book_new();
  const genTime = new Date(result.generatedAt).toLocaleString();

  // Sheet 1: 概览
  const overviewRows: (string | number)[][] = [
    ['团队名称', teamName],
    ['生成时间', genTime],
    ['使用模型', result.model],
  ];
  if (goal && goal.trim()) overviewRows.push(['团队目标', goal.trim()]);
  overviewRows.push(['推荐题单数', result.problemSets.length]);
  overviewRows.push(['知识点数', result.knowledgePoints.length]);
  const overview = XLSX.utils.aoa_to_sheet(overviewRows);
  overview['!cols'] = [{ wch: 14 }, { wch: 40 }];
  XLSX.utils.book_append_sheet(wb, overview, '概览');

  // Sheet 2: 整体分析
  const analysis = XLSX.utils.aoa_to_sheet([
    ['整体分析'],
    [result.analysis || '(无)'],
  ]);
  analysis['!cols'] = [{ wch: 80 }];
  XLSX.utils.book_append_sheet(wb, analysis, '整体分析');

  // Sheet 3: 推荐题单
  const psRows: (string | number)[][] = [['序号', '题单名称', '知识点', '难度', '推荐理由', '题目']];
  result.problemSets.forEach((ps, i) => {
    psRows.push([
      i + 1,
      ps.title,
      ps.topic,
      ps.difficulty,
      ps.reason,
      ps.problems.join(', '),
    ]);
  });
  const psSheet = XLSX.utils.aoa_to_sheet(psRows);
  psSheet['!cols'] = [
    { wch: 6 }, { wch: 22 }, { wch: 18 }, { wch: 14 }, { wch: 40 }, { wch: 30 },
  ];
  XLSX.utils.book_append_sheet(wb, psSheet, '推荐题单');

  // Sheet 4: 知识点清单
  const kpRows: (string | number)[][] = [
    ['序号', '知识点', '优先级', '需加强成员', '说明'],
  ];
  result.knowledgePoints.forEach((kp, i) => {
    kpRows.push([
      i + 1,
      kp.topic,
      PRIORITY_TEXT[kp.priority],
      kp.members.join(', '),
      kp.description,
    ]);
  });
  const kpSheet = XLSX.utils.aoa_to_sheet(kpRows);
  kpSheet['!cols'] = [
    { wch: 6 }, { wch: 18 }, { wch: 8 }, { wch: 22 }, { wch: 50 },
  ];
  XLSX.utils.book_append_sheet(wb, kpSheet, '知识点清单');

  const buf = XLSX.write(wb, { type: 'buffer', bookType: 'xlsx' }) as Buffer;
  return buf;
}

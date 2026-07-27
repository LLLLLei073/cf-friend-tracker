/**
 * Codeforces 题目标签中英对照表。
 * 未收录的标签保持原样返回。
 */
const TAG_LABELS: Record<string, string> = {
  math: '数学',
  greedy: '贪心',
  'dp': '动态规划',
  'data structures': '数据结构',
  'brute force': '暴力',
  'constructive algorithms': '构造',
  graphs: '图论',
  sortings: '排序',
  'binary search': '二分',
  'number theory': '数论',
  trees: '树',
  strings: '字符串',
  geometry: '几何',
  combinatorics: '组合数学',
  'dfs and similar': 'DFS 与类似',
  bitmasks: '位运算',
  'two pointers': '双指针',
  'shortest paths': '最短路',
  games: '博弈',
  implementation: '实现',
  probabilities: '概率',
  hashes: '哈希',
  fft: 'FFT',
  flows: '网络流',
  'graph matchings': '图匹配',
  'meet-in-the-middle': '折半搜索',
  matrices: '矩阵',
  'string suffix structures': '字符串后缀结构',
  'expression parsing': '表达式解析',
  'ternary search': '三分',
  'chinese remainder theorem': '中国剩余定理',
  schedules: '调度',
  '*special': '特殊',
  '2-sat': '2-SAT',
};

export function translateTag(tag: string): string {
  return TAG_LABELS[tag.toLowerCase()] ?? tag;
}

// MathJax 按需加载工具。
// Codeforces 题面使用美元符号分隔符:
//   行内公式 $$$...$$$  (三个 $)
//   行间公式 $$$$$$...$$$$$$  (六个 $)
// 这里据此配置 MathJax v3 (SVG 输出), 优先加载本地打包脚本以支持离线,
// 本地缺失时回退 CDN。
//
// 注意: display 分隔符必须是 6 个 $, 不能写成 4 个。写成 4 个 ($$$$) 会与
// 行内的 3 个 $ 形成前缀冲突, 导致 TeX 输入 jax 初始化异常、startup.promise
// reject, 最终 typesetPromise 缺失 —— 表现为所有公式都不渲染 (保持字面 $$$)。

/* eslint-disable @typescript-eslint/no-explicit-any */
declare global {
  interface Window {
    MathJax?: any;
  }
}

// tex-svg-full.js 包含 color 等全部扩展, CF 题面常用 \color{red}{...} 可直接支持
const LOCAL_SRC = 'mathjax/tex-svg-full.js';
const CDN_SRC = 'https://cdn.jsdelivr.net/npm/mathjax@3/es5/tex-svg-full.js';

let loadPromise: Promise<boolean> | null = null;

function injectScript(src: string): Promise<void> {
  return new Promise((resolve, reject) => {
    // 如果已经存在同地址脚本, 直接认为已加载 (dev 热更新不会重新加载, 但脚本缓存命中)
    const existing = document.querySelector(`script[src="${src}"]`);
    if (existing) {
      resolve();
      return;
    }
    const script = document.createElement('script');
    script.src = src;
    script.async = true;
    script.onload = () => resolve();
    script.onerror = () => reject(new Error(`加载失败: ${src}`));
    document.head.appendChild(script);
  });
}

// 确保 MathJax 已加载并完成启动。返回是否加载成功。
export function ensureMathJax(): Promise<boolean> {
  if (loadPromise) return loadPromise;

  loadPromise = (async () => {
    if (typeof window === 'undefined') return false;

    // 已经可用 (例如刷新后脚本仍在 window)
    if (window.MathJax?.typesetPromise) {
      return true;
    }

    // 配置必须在脚本加载前设置
    window.MathJax = {
      tex: {
        inlineMath: [['$$$', '$$$']],
        displayMath: [['$$$$$$', '$$$$$$']],
        processEscapes: true,
      },
      svg: { fontCache: 'local' },
      options: {
        // 跳过这些标签内部的文本 (代码/样例等), 避免误渲染
        skipHtmlTags: ['script', 'noscript', 'style', 'textarea', 'pre', 'code'],
      },
      startup: { typeset: false },
    };

    let injected = false;
    try {
      await injectScript(LOCAL_SRC);
      injected = true;
    } catch (e) {
      console.warn('[mathjax] 本地脚本加载失败, 回退 CDN:', e);
      try {
        await injectScript(CDN_SRC);
        injected = true;
      } catch (e2) {
        console.error('[mathjax] CDN 也加载失败, 公式将不渲染:', e2);
        return false;
      }
    }

    if (!injected) return false;

    // 等待 MathJax 启动完成 (脚本执行后才会创建 startup.promise)
    let retries = 0;
    while (!window.MathJax?.startup?.promise && retries < 50) {
      await new Promise((r) => setTimeout(r, 50));
      retries++;
    }

    const mj = window.MathJax;
    if (mj?.startup?.promise) {
      try {
        await mj.startup.promise;
      } catch (e) {
        console.error('[mathjax] startup.promise reject:', e);
        return false;
      }
    }

    const ok = !!window.MathJax?.typesetPromise;
    if (!ok) {
      console.error(
        '[mathjax] 脚本已加载但 typesetPromise 不存在, 可能是配置或启动异常。',
        window.MathJax,
      );
    }
    return ok;
  })();

  // 失败时允许下次重试, 避免永久缓存 false
  loadPromise.catch(() => {
    loadPromise = null;
  });

  return loadPromise;
}

// 对指定元素排版公式。返回是否成功排版。
export async function typesetMath(el: HTMLElement): Promise<boolean> {
  try {
    const ok = await ensureMathJax();
    if (!ok) return false;
    const mj = window.MathJax;
    if (mj?.typesetPromise) {
      // 先清理该元素上一次的排版状态, 避免重复渲染报错
      if (mj.typesetClear) {
        try {
          mj.typesetClear([el]);
        } catch {
          /* ignore */
        }
      }
      await mj.typesetPromise([el]);
      return true;
    }
    return false;
  } catch (e) {
    console.error('[mathjax] typeset 失败:', e);
    return false;
  }
}

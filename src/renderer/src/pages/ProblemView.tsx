import { useEffect, useRef, useState, useCallback } from 'react';
import { useParams, useNavigate } from 'react-router-dom';
import type { ProblemStatement, RunAllResult } from '../types';
import { typesetMath } from '../utils/mathjax';
import styles from '../styles/problemView.module.css';

const CPP_TEMPLATE = `#include <bits/stdc++.h>
using namespace std;

int main() {
    ios::sync_with_stdio(false);
    cin.tie(nullptr);

    return 0;
}
`;

export default function ProblemView() {
  const { contestId, index } = useParams<{ contestId: string; index: string }>();
  const navigate = useNavigate();
  const cid = Number(contestId);

  const [statement, setStatement] = useState<ProblemStatement | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState('');

  const [code, setCode] = useState('');
  const [running, setRunning] = useState(false);
  const [result, setResult] = useState<RunAllResult | null>(null);
  const [savedHint, setSavedHint] = useState(false);
  const [compiler, setCompiler] = useState<string | null>(null);

  // 题面语言: 原文 / AI 中文翻译
  const [lang, setLang] = useState<'orig' | 'zh'>('orig');
  const [translating, setTranslating] = useState(false);
  const [transError, setTransError] = useState('');

  const statementRef = useRef<HTMLDivElement>(null);
  const saveTimer = useRef<ReturnType<typeof setTimeout> | null>(null);

  const problemKey = `${cid}_${index}`;

  // 加载题面 + 已保存代码 + 编译器探测
  useEffect(() => {
    let cancelled = false;
    (async () => {
      setLoading(true);
      setError('');
      setResult(null);
      try {
        const stmt = await window.api.problem.getStatement(cid, index!);
        if (cancelled) return;
        setStatement(stmt);
        // 已有翻译缓存则默认展示中文
        setLang(stmt.translation ? 'zh' : 'orig');
        setTransError('');

        const saved = await window.api.problem.getCode(problemKey);
        if (cancelled) return;
        setCode(saved && saved.trim() ? saved : CPP_TEMPLATE);
      } catch (e) {
        if (cancelled) return;
        let msg = (e as Error).message || String(e);
        msg = msg.replace(/^Error invoking remote method '[^']+':\s*/i, '');
        setError(msg);
      } finally {
        if (!cancelled) setLoading(false);
      }
    })();
    window.api.problem.detectCompiler().then((c) => {
      if (!cancelled) setCompiler(c);
    });
    return () => {
      cancelled = true;
    };
  }, [cid, index, problemKey]);

  // 注入题面 HTML 后渲染公式
  // 注意: 必须依赖 loading —— setStatement 后还有 await, statement 更新时
  // loading 仍为 true, 容器 div 尚未挂载 (ref 为 null); 等 loading 变 false
  // 容器挂载后再注入, 否则题面永远为空白。
  useEffect(() => {
    if (!loading && statement && statementRef.current) {
      const html =
        lang === 'zh' && statement.translation ? statement.translation.html : statement.html;
      statementRef.current.innerHTML = html;
      typesetMath(statementRef.current);
    }
  }, [statement, loading, lang]);

  // AI 翻译题面(force 为 true 时忽略缓存重新翻译)
  const handleTranslate = async (force = false) => {
    if (!statement || translating) return;
    if (statement.translation && !force) {
      setLang('zh');
      return;
    }
    setTranslating(true);
    setTransError('');
    try {
      const updated = await window.api.problem.translate(cid, index!, force);
      setStatement(updated);
      setLang('zh');
    } catch (e) {
      let msg = (e as Error).message || String(e);
      msg = msg.replace(/^Error invoking remote method '[^']+':\s*/i, '');
      setTransError(msg);
    } finally {
      setTranslating(false);
    }
  };

  // 代码变化时防抖保存
  const handleCodeChange = useCallback(
    (value: string) => {
      setCode(value);
      if (saveTimer.current) clearTimeout(saveTimer.current);
      saveTimer.current = setTimeout(() => {
        window.api.problem.setCode(problemKey, value);
        setSavedHint(true);
        setTimeout(() => setSavedHint(false), 1500);
      }, 800);
    },
    [problemKey],
  );

  // Tab 键插入四个空格而非切换焦点
  const handleKeyDown = (e: React.KeyboardEvent<HTMLTextAreaElement>) => {
    if (e.key === 'Tab') {
      e.preventDefault();
      const ta = e.currentTarget;
      const start = ta.selectionStart;
      const end = ta.selectionEnd;
      const next = code.slice(0, start) + '    ' + code.slice(end);
      handleCodeChange(next);
      requestAnimationFrame(() => {
        ta.selectionStart = ta.selectionEnd = start + 4;
      });
    }
  };

  const handleRun = async () => {
    if (!statement) return;
    setRunning(true);
    setResult(null);
    // 运行前立即保存当前代码
    window.api.problem.setCode(problemKey, code);
    try {
      const r = await window.api.problem.runCode(code, statement.samples);
      setResult(r);
    } catch (e) {
      setResult({
        results: [],
        allPassed: false,
        compilerPath: null,
        compileError: (e as Error).message,
      });
    } finally {
      setRunning(false);
    }
  };

  const handleReset = () => {
    if (confirm('确定重置为默认模板吗？当前代码将被覆盖。')) {
      handleCodeChange(CPP_TEMPLATE);
    }
  };

  const openOfficial = () => {
    window.open(`https://codeforces.com/contest/${cid}/problem/${index}`, '_blank');
  };

  if (loading) {
    return <p className={styles.loading}>正在加载题面...</p>;
  }

  if (error) {
    return (
      <div className={styles.container}>
        <div className={styles.topbar}>
          <button className={styles.backBtn} onClick={() => navigate('/problems')}>
            ← 返回
          </button>
        </div>
        <p className={styles.error}>加载失败：{error}</p>
      </div>
    );
  }

  const sampleCount = statement?.samples.length ?? 0;

  return (
    <div className={styles.container}>
      <div className={styles.topbar}>
        <button className={styles.backBtn} onClick={() => navigate('/problems')}>
          ← 返回
        </button>
        <span className={styles.topTitle}>
          {cid}
          {index}. {statement?.name}
        </span>
        <button className={styles.openOfficial} onClick={openOfficial}>
          在浏览器打开原题
        </button>
      </div>

      <div className={styles.split}>
        {/* 左：题面 */}
        <div className={styles.left}>
          <div className={styles.panel}>
            <div className={styles.stmtToolbar}>
              {statement?.translation ? (
                <div className={styles.langSwitch}>
                  <button
                    className={`${styles.langBtn} ${lang === 'orig' ? styles.langBtnActive : ''}`}
                    onClick={() => setLang('orig')}
                  >
                    原文
                  </button>
                  <button
                    className={`${styles.langBtn} ${lang === 'zh' ? styles.langBtnActive : ''}`}
                    onClick={() => setLang('zh')}
                  >
                    中文
                  </button>
                </div>
              ) : (
                <span className={styles.stmtToolbarLabel}>题面</span>
              )}
              <button
                className={styles.translateBtn}
                onClick={() => handleTranslate(!!statement?.translation)}
                disabled={translating}
                title={
                  statement?.translation
                    ? '忽略缓存, 重新调用 AI 翻译'
                    : '使用设置中配置的 AI 接口翻译题面'
                }
              >
                {translating
                  ? '⏳ 翻译中...'
                  : statement?.translation
                    ? '↻ 重新翻译'
                    : '🌐 AI 翻译'}
              </button>
            </div>
            {transError && <p className={styles.transError}>翻译失败：{transError}</p>}
            <div ref={statementRef} className={styles.statementBody} />
          </div>
        </div>

        {/* 右：编辑器 + 运行 */}
        <div className={styles.right}>
          <div className={styles.panel}>
            <div className={styles.editorHeader}>
              <span className={styles.editorTitle}>C++ 代码</span>
              <span className={styles.editorMeta}>
                {compiler ? `编译器：${compiler}` : '未检测到 g++，请在设置中配置'}
              </span>
            </div>
            <textarea
              className={styles.editor}
              value={code}
              onChange={(e) => handleCodeChange(e.target.value)}
              onKeyDown={handleKeyDown}
              spellCheck={false}
              placeholder="在此编写 C++ 代码..."
            />
            <div className={styles.actionsRow}>
              <button className={styles.runBtn} onClick={handleRun} disabled={running}>
                {running ? '编译运行中...' : `▶ 运行全部样例（${sampleCount}）`}
              </button>
              <button className={styles.resetBtn} onClick={handleReset}>
                重置模板
              </button>
              {savedHint && <span className={styles.saveHint}>✓ 已自动保存</span>}
            </div>

            {sampleCount === 0 && !result && (
              <p className={styles.editorMeta} style={{ marginTop: 12 }}>
                本题未解析到样例，可自行编写后在本地测试。
              </p>
            )}

            {/* 运行结果 */}
            {result && (
              <div className={styles.results}>
                {result.compileError ? (
                  <div className={styles.compileError}>
                    <strong>编译失败</strong>
                    <pre>{result.compileError}</pre>
                  </div>
                ) : (
                  <>
                    <p
                      className={`${styles.summary} ${
                        result.allPassed ? styles.summaryPass : styles.summaryFail
                      }`}
                    >
                      {result.allPassed
                        ? `✓ 全部通过（${result.results.length}/${result.results.length}）`
                        : `✗ 通过 ${result.results.filter((r) => r.passed).length}/${result.results.length}`}
                    </p>
                    {result.results.map((r) => (
                      <div key={r.index} className={styles.caseCard}>
                        <div
                          className={`${styles.caseHeader} ${
                            r.passed ? styles.caseHeaderPass : styles.caseHeaderFail
                          }`}
                        >
                          <span>
                            {r.passed ? '✓' : '✗'} 样例 {r.index + 1}
                            {r.timedOut ? ' · 超时' : ''}
                          </span>
                          {r.timeMs !== undefined && (
                            <span className={styles.caseTime}>{r.timeMs} ms</span>
                          )}
                        </div>
                        <div className={styles.caseBody}>
                          <div className={styles.ioBlock}>
                            <div className={styles.ioLabel}>输入</div>
                            <pre className={styles.ioPre}>{r.input}</pre>
                          </div>
                          <div className={styles.ioBlock}>
                            <div className={styles.ioLabel}>期望输出</div>
                            <pre className={styles.ioPre}>{r.expected}</pre>
                          </div>
                          <div className={styles.ioBlock}>
                            <div className={styles.ioLabel}>实际输出</div>
                            <pre
                              className={`${styles.ioPre} ${
                                r.passed ? '' : styles.ioPreBad
                              }`}
                            >
                              {r.actual || '(无输出)'}
                            </pre>
                          </div>
                          {r.error && (
                            <div className={styles.ioBlock}>
                              <div className={styles.ioLabel}>错误信息</div>
                              <pre className={styles.ioPre}>{r.error}</pre>
                            </div>
                          )}
                        </div>
                      </div>
                    ))}
                  </>
                )}
              </div>
            )}
          </div>
        </div>
      </div>
    </div>
  );
}

import { useEffect, useState, useRef } from 'react';
import type { Settings as SettingsType, UpdateStatus, UpdateInfo, UpdateProgress, PlatformAccount, CacheStats, LuoguCache } from '../types';
import { useToast } from '../components/Toast';
import { callApi } from '../utils/safe-call';
import ChangelogModal from '../components/ChangelogModal';
import Markdown from '../components/Markdown';
import styles from '../styles/settings.module.css';

function formatBytes(bytes: number): string {
  if (bytes < 1024) return `${bytes} B`;
  if (bytes < 1024 * 1024) return `${(bytes / 1024).toFixed(1)} KB`;
  return `${(bytes / (1024 * 1024)).toFixed(1)} MB`;
}

export default function Settings() {
  const [settings, setSettings] = useState<SettingsType | null>(null);
  const [saved, setSaved] = useState(false);
  const [syncMsg, setSyncMsg] = useState('');
  const [syncing, setSyncing] = useState(false);

  // 更新相关状态
  const [updateStatus, setUpdateStatus] = useState<UpdateStatus>('idle');
  const [updateInfo, setUpdateInfo] = useState<UpdateInfo | null>(null);
  const [updateError, setUpdateError] = useState<string | null>(null);
  const [appVersion, setAppVersion] = useState('');
  const [progress, setProgress] = useState<UpdateProgress | null>(null);
  const [checking, setChecking] = useState(false);
  const statusRef = useRef<UpdateStatus>('idle');
  const [notifyTestMsg, setNotifyTestMsg] = useState('');
  const [showChangelog, setShowChangelog] = useState(false);
  const firstLoadRef = useRef(true);

  // AI 接口测试
  const [aiTesting, setAiTesting] = useState(false);
  const [aiTestMsg, setAiTestMsg] = useState('');

  // 我的关联账号（洛谷）
  const [luoguQuery, setLuoguQuery] = useState('');
  const [luoguCandidates, setLuoguCandidates] = useState<PlatformAccount[]>([]);
  const [luoguSearching, setLuoguSearching] = useState(false);
  const [luoguSearchMsg, setLuoguSearchMsg] = useState('');
  // 「我的洛谷」详情缓存 — 用于在 Settings 里直接展示「数据已导入」的具体数字
  // (之前只显示一行文字「已关联 xxx」, 用户看不到实际数据, 体验差)
  const [myLuoguCache, setMyLuoguCache] = useState<LuoguCache | undefined>(undefined);

  // 进入页面 / 设置变更时, 同步拉一次我的洛谷缓存
  useEffect(() => {
    (async () => {
      if (settings?.myLuogu?.uid) {
        const all = await window.api.luogu.getAllCache();
        setMyLuoguCache(all[settings.myLuogu.uid]);
      } else {
        setMyLuoguCache(undefined);
      }
    })();
  }, [settings?.myLuogu?.uid]);

  useEffect(() => {
    (async () => {
      const s = await window.api.store.getSettings();
      setSettings(s);
      const result = await window.api.updater.getStatus();
      setUpdateStatus(result.status);
      setUpdateInfo(result.info);
      setUpdateError(result.error);
      setAppVersion(result.appVersion);
      statusRef.current = result.status;
    })();

    // 订阅更新状态变化
    const unsubStatus = window.api.updater.onStatus((data) => {
      setUpdateStatus(data.status);
      setUpdateInfo(data.info);
      setUpdateError(data.error);
      statusRef.current = data.status;
      if (data.status !== 'downloading') {
        setProgress(null);
      }
      if (data.status !== 'checking') {
        setChecking(false);
      }
    });

    // 订阅下载进度
    const unsubProgress = window.api.updater.onProgress((p) => {
      setProgress(p);
    });

    return () => {
      unsubStatus();
      unsubProgress();
    };
  }, []);

  // 主题、默认页面、通知、AI 接口等设置变化时自动保存（即时生效）
  // 首次从存储加载时跳过写盘,避免无意义回写(在 EPERM 环境下会触发长时间阻塞)
  useEffect(() => {
    if (!settings) return;
    if (firstLoadRef.current) {
      firstLoadRef.current = false;
      return;
    }
    window.api.store.setSettings(settings);
  }, [settings?.theme, settings?.defaultPage, settings?.notifyRatingChange, settings?.notifyContestStart, settings?.contestNotifyMinutes, settings?.launchRefreshStarredOnly, settings?.enableTray, settings?.aiApiBase, settings?.aiApiKey, settings?.aiModel, settings?.enableLuogu]);

  const handleSave = async () => {
    if (!settings) return;
    await window.api.store.setSettings(settings);
    setSaved(true);
    setTimeout(() => setSaved(false), 2000);

    // 自动同步好友数据(配置了API会删除不在关注列表中的好友)
    setSyncing(true);
    setSyncMsg('');
    try {
      const result = await window.api.cf.syncFriendsAuto();
      if (result.skipped) {
        setSyncMsg('未配置 Handle,跳过同步');
      } else if (result.error) {
        setSyncMsg(`同步失败: ${result.error}`);
      } else {
        const parts: string[] = [];
        if (result.removed > 0) parts.push(`移除 ${result.removed} 个`);
        if (result.synced > 0) parts.push(`同步 ${result.synced} 位`);
        if (parts.length === 0) {
          setSyncMsg('暂无关注好友,已刷新自身数据');
        } else {
          setSyncMsg(`已${parts.join(' · ')}好友数据`);
        }
      }
    } catch (e) {
      setSyncMsg(`同步失败: ${(e as Error).message}`);
    } finally {
      setSyncing(false);
    }
  };

  // 题面缓存统计与自动清理
  const toast = useToast();
  const [cacheStats, setCacheStats] = useState<CacheStats | null>(null);
  const [cacheCleaning, setCacheCleaning] = useState(false);
  const loadCacheStats = async () => {
    setCacheStats(await window.api.cache.getStats());
  };
  useEffect(() => {
    loadCacheStats();
  }, []);

  const handleClearCache = async () => {
    if (!confirm('确定要清空所有缓存数据吗?好友列表不会删除。')) return;
    const ok = await callApi(window.api.store.clearCache(), toast, {
      successMsg: '缓存已清空',
      errorMsg: '清空缓存失败',
    });
    if (ok) loadCacheStats();
  };

  const handleCheckUpdate = async () => {
    setChecking(true);
    setUpdateError(null);
    try {
      const result = await window.api.updater.checkForUpdates();
      setUpdateStatus(result.status);
      setUpdateInfo(result.info);
      setUpdateError(result.error);
    } catch (e) {
      setUpdateError((e as Error).message);
      setUpdateStatus('error');
    } finally {
      setChecking(false);
    }
  };

  const handleInstallUpdate = async () => {
    await window.api.updater.installUpdate();
  };

  const handleTestNotify = async () => {
    try {
      const ok = await window.api.notify.test();
      setNotifyTestMsg(ok ? '通知已发送，请查看系统通知区域' : '通知发送失败，系统可能不支持');
    } catch (e) {
      setNotifyTestMsg(`测试失败: ${(e as Error).message}`);
    }
    setTimeout(() => setNotifyTestMsg(''), 4000);
  };

  const handleTestAI = async () => {
    setAiTesting(true);
    setAiTestMsg('');
    try {
      const result = await window.api.ai.testConnection(settings ?? undefined);
      setAiTestMsg(result.ok ? '✓ 连接成功，AI 接口配置正常' : `✗ ${result.error ?? '连接失败'}`);
    } catch (e) {
      setAiTestMsg(`✗ 测试失败: ${(e as Error).message}`);
    } finally {
      setAiTesting(false);
      setTimeout(() => setAiTestMsg(''), 6000);
    }
  };

  // ---- 我的关联账号: 洛谷 ----
  const handleSearchLuogu = async () => {
    const q = luoguQuery.trim();
    if (!q) return;
    setLuoguSearching(true);
    setLuoguSearchMsg('');
    setLuoguCandidates([]);
    try {
      const res = await window.api.luogu.search(q);
      if (res && res.length > 0) {
        setLuoguCandidates(res);
      } else {
        setLuoguSearchMsg('未找到匹配的洛谷账号');
      }
    } catch (e) {
      setLuoguSearchMsg(`搜索失败: ${(e as Error).message}`);
    } finally {
      setLuoguSearching(false);
    }
  };

  const handleLinkLuogu = async (acc: PlatformAccount) => {
    if (!settings) return;
    const next = { ...settings, myLuogu: acc };
    setSettings(next);
    setLuoguCandidates([]);
    setLuoguQuery('');
    setLuoguSearchMsg('已选择，正在保存…');
    try {
      await window.api.store.setSettings(next);
      // 关联后立即拉一次详情, 让 settings.myLuogu 的数据随时可见
      // (myLuogu 现在直接在 Settings 里渲染概览卡片, 失败也要给用户具体提示)
      try {
        const ok = await window.api.luogu.refreshByUid(acc.uid);
        if (ok) {
          // 刷新本地 myLuoguCache 状态, 即时展示新数据
          const all = await window.api.luogu.getAllCache();
          setMyLuoguCache(all[acc.uid]);
          setLuoguSearchMsg(`已关联洛谷账号「${acc.name}」并导入数据`);
        } else {
          setLuoguSearchMsg(`已关联「${acc.name}」, 但拉取详情失败 — 请检查网络或稍后手动刷新`);
        }
      } catch (e) {
        setLuoguSearchMsg(`已关联, 但拉取详情异常: ${(e as Error).message}`);
      }
    } catch (e) {
      setLuoguSearchMsg(`保存失败: ${(e as Error).message}`);
    }
  };

  const handleUnlinkLuogu = async () => {
    if (!settings) return;
    const removedUid = settings.myLuogu?.uid;
    const next = { ...settings, myLuogu: undefined };
    setSettings(next);
    setLuoguSearchMsg('');
    try {
      await window.api.store.setSettings(next);
      // 精准删除"我的洛谷"对应的 LuoguCache, 不影响好友数据
      if (removedUid != null) {
        window.api.luogu
          .deleteCacheForUid(removedUid)
          .catch(() => {/* 即便失败也不阻断解绑流程 */});
        setMyLuoguCache(undefined);
      }
    } catch (e) {
      setLuoguSearchMsg(`解除失败: ${(e as Error).message}`);
    }
  };

  // ---- 我的关联账号: 牛客已整体移除 (Phase 1b 退役, 2026-08) ----

  // 渲染更新状态文本
  const renderUpdateStatus = () => {
    switch (updateStatus) {
      case 'checking':
        return <p className={styles.updateMsg}>正在检查更新...</p>;
      case 'available':
        return (
          <p className={styles.updateMsg}>
            发现新版本 v{updateInfo?.version ?? '?'}，正在自动下载...
          </p>
        );
      case 'not-available':
        return <p className={styles.updateOk}>已是最新版本</p>;
      case 'downloading':
        return (
          <div className={styles.progressWrap}>
            <p className={styles.updateMsg}>
              正在下载 v{updateInfo?.version ?? '?'}... {progress?.percent ?? 0}%
            </p>
            <div className={styles.progressBar}>
              <div
                className={styles.progressFill}
                style={{ width: `${progress?.percent ?? 0}%` }}
              />
            </div>
            {progress && (
              <p className={styles.progressDetail}>
                {formatBytes(progress.transferred)} / {formatBytes(progress.total)}
                {' · '}
                {formatBytes(progress.bytesPerSecond)}/s
              </p>
            )}
          </div>
        );
      case 'downloaded':
        return (
          <div className={styles.progressWrap}>
            <p className={styles.updateOk}>
              v{updateInfo?.version ?? '?'} 已下载完毕，重启后生效
            </p>
            <button onClick={handleInstallUpdate} className={styles.installBtn}>
              立即安装并重启
            </button>
          </div>
        );
      case 'error':
        return <p className={styles.updateError}>更新失败: {updateError ?? '未知错误'}</p>;
      default:
        return <p className={styles.updateHint}>点击「检查更新」查看是否有新版本</p>;
    }
  };

  if (!settings) return <p>加载中...</p>;

  return (
    <div className={styles.container}>
      <h2 className={styles.heading}>设置</h2>

      <div className={styles.form}>
        <div className={styles.field}>
          <label>我的 CF Handle(用于导入好友)</label>
          <input
            type="text"
            value={settings.myHandle}
            onChange={(e) => setSettings({ ...settings, myHandle: e.target.value })}
            className={styles.input}
          />
        </div>

        {/* ---- 我的关联账号 ---- */}
        <div className={styles.updateSection}>
          <label className={styles.updateLabel}>我的关联账号</label>
          <p className={styles.updateHint}>关联你自己的洛谷 / 牛客账号，跨平台功能（如排行、刷新）会据此识别「我」。</p>

          <div className={styles.linkedRow}>
            <span className={styles.linkedLabel}>洛谷</span>
            {settings.myLuogu ? (
              <span className={styles.linkedValue}>
                {settings.myLuogu.name}
                <span className={styles.muted}>（uid {settings.myLuogu.uid}）</span>
                <button type="button" onClick={handleUnlinkLuogu} className={styles.linkRemove}>
                  解除关联
                </button>
              </span>
            ) : (
              <span className={styles.muted}>未关联</span>
            )}
          </div>

          {/* 已关联时, 直接展示拉取到的洛谷数据 (头像 + 通过/提交 + 等级色)
              让用户立刻看到「数据是否真的导入」, 不要再回到好友列表才能确认 */}
          {settings.myLuogu && (
            <MyLuoguSummary
              account={settings.myLuogu}
              cache={myLuoguCache}
              onRefresh={async () => {
                const ok = await window.api.luogu.refreshByUid(settings.myLuogu!.uid);
                if (ok) {
                  const all = await window.api.luogu.getAllCache();
                  setMyLuoguCache(all[settings.myLuogu!.uid]);
                }
                return ok;
              }}
            />
          )}

          {!settings.myLuogu && (
            <div className={styles.field}>
              <label>搜索并关联洛谷账号</label>
              <div className={styles.searchRow}>
                <input
                  type="text"
                  value={luoguQuery}
                  onChange={(e) => setLuoguQuery(e.target.value)}
                  onKeyDown={(e) => {
                    if (e.key === 'Enter' && !luoguSearching) handleSearchLuogu();
                  }}
                  placeholder="输入洛谷用户名，如 tourist"
                  className={styles.input}
                />
                <button
                  type="button"
                  onClick={handleSearchLuogu}
                  disabled={luoguSearching || !luoguQuery.trim()}
                  className={styles.checkBtn}
                >
                  {luoguSearching ? '搜索中…' : '搜索'}
                </button>
              </div>
              {luoguCandidates.length > 0 && (
                <ul className={styles.candidateList}>
                  {luoguCandidates.map((c) => (
                    <li key={c.uid}>
                      <button type="button" onClick={() => handleLinkLuogu(c)} className={styles.candidateBtn}>
                        {c.name} <span className={styles.muted}>（uid {c.uid}）</span>
                      </button>
                    </li>
                  ))}
                </ul>
              )}
              {luoguSearchMsg && <p className={styles.updateMsg}>{luoguSearchMsg}</p>}
            </div>
          )}

          {/* ---- 牛客已整体移除 (Phase 1b 退役, 2026-08) ---- */}

          <div className={styles.switchRow}>
            <label className={styles.notifyLabel}>启用洛谷跨平台功能</label>
            <input
              type="checkbox"
              checked={settings.enableLuogu}
              onChange={(e) => setSettings({ ...settings, enableLuogu: e.target.checked })}
              className={styles.notifyToggle}
            />
          </div>
          <p className={styles.updateHint}>
            关闭后, 洛谷的刷新与跨平台排行会被跳过。修改即时生效。
          </p>
        </div>

        <div className={styles.field}>
          <label>API Key</label>
          <input
            type="text"
            value={settings.apiKey}
            onChange={(e) => setSettings({ ...settings, apiKey: e.target.value })}
            className={styles.input}
          />
        </div>

        <div className={styles.field}>
          <label>API Secret</label>
          <input
            type="password"
            value={settings.apiSecret}
            onChange={(e) => setSettings({ ...settings, apiSecret: e.target.value })}
            className={styles.input}
          />
        </div>

        <button onClick={handleSave} className={styles.saveBtn} disabled={syncing}>
          {syncing ? '保存并同步中...' : '保存设置'}
        </button>
        {saved && <p className={styles.saved}>✓ 已保存</p>}
        {syncMsg && (
          <p className={styles.saved} style={{ color: syncMsg.includes('失败') ? '#C41E3A' : '#4A7C3A' }}>
            {syncMsg}
          </p>
        )}

        <hr className={styles.divider} />

        <div className={styles.info}>
          <p>上次刷新时间: {settings.lastRefreshAt
            ? new Date(settings.lastRefreshAt).toLocaleString()
            : '从未刷新'}</p>
        </div>

        <div className={styles.updateSection}>
          <label className={styles.updateLabel}>题面缓存</label>
          {cacheStats && (
            <p className={styles.updateHint}>
              题面 {cacheStats.problemStatements} 个 · 代码 {cacheStats.problemCodeFiles} 个 · 收藏 {cacheStats.favoritesCount} 个 · 共 {formatBytes(cacheStats.totalBytes)}
              <br />
              目录: {cacheStats.cacheDir}
            </p>
          )}
          <div className={styles.themeRow}>
            <button
              className={styles.checkBtn}
              disabled={cacheCleaning}
              onClick={async () => {
                setCacheCleaning(true);
                const res = await callApi(window.api.cache.cleanup(90), toast, { errorMsg: '清理失败' });
                setCacheCleaning(false);
                if (res) {
                  toast.success(`已清理 ${res.removed} 个过期题面, 释放 ${formatBytes(res.freedBytes)}`);
                  loadCacheStats();
                }
              }}
            >
              {cacheCleaning ? '清理中...' : '清理过期题面'}
            </button>
            <button className={styles.checkBtn} onClick={loadCacheStats}>
              刷新统计
            </button>
          </div>
          <p className={styles.updateHint}>应用启动时自动删除超过 90 天未访问的题面, 防止磁盘占用无限增长。</p>
        </div>

        <button onClick={handleClearCache} className={styles.dangerBtn}>
          清空缓存数据
        </button>

        <hr className={styles.divider} />

        {/* ---- 数据备份与迁移 ---- */}
        <div className={styles.updateSection}>
          <label className={styles.updateLabel}>数据备份与迁移</label>
          <p className={styles.updateHint}>导出全部数据（好友、缓存、团队、AI 报告、设置）为 JSON 文件，换机或重装时可导入恢复。</p>
          <div className={styles.themeRow}>
            <button
              className={styles.checkBtn}
              onClick={async () => {
                const res = await window.api.store.exportBackup();
                if (res.ok) alert(`已导出到 ${res.path}`);
                else if (res.error && !res.canceled) alert(`导出失败: ${res.error}`);
              }}
            >
              导出备份
            </button>
            <button
              className={styles.checkBtn}
              onClick={async () => {
                if (!confirm('导入备份会覆盖当前数据，确定继续吗？')) return;
                const res = await window.api.store.importBackup();
                if (res.ok) {
                  alert(`导入成功：好友 ${res.imported?.friends ?? 0} 位 · 团队 ${res.imported?.teams ?? 0} 个。建议重启应用。`);
                } else if (res.error && res.error !== '已取消') {
                  alert(`导入失败: ${res.error}`);
                }
              }}
            >
              导入备份
            </button>
          </div>
        </div>

        <hr className={styles.divider} />

        {/* ---- 主题设置 ---- */}
        <div className={styles.updateSection}>
          <label className={styles.updateLabel}>外观主题</label>
          <div className={styles.themeRow}>
            <button
              className={`${styles.themeBtn} ${settings.theme === 'light' ? styles.themeActive : ''}`}
              onClick={() => {
                document.documentElement.classList.remove('dark');
                setSettings({ ...settings, theme: 'light' });
              }}
            >
              ☀️ 浅色
            </button>
            <button
              className={`${styles.themeBtn} ${settings.theme === 'dark' ? styles.themeActive : ''}`}
              onClick={() => {
                document.documentElement.classList.add('dark');
                setSettings({ ...settings, theme: 'dark' });
              }}
            >
              🌙 深色
            </button>
            <button
              className={`${styles.themeBtn} ${settings.theme === 'system' ? styles.themeActive : ''}`}
              onClick={() => {
                const isDark = window.matchMedia('(prefers-color-scheme: dark)').matches;
                document.documentElement.classList.toggle('dark', isDark);
                setSettings({ ...settings, theme: 'system' });
              }}
            >
              🖥️ 跟随系统
            </button>
          </div>
        </div>

        <hr className={styles.divider} />

        {/* ---- 启动页面设置 ---- */}
        <div className={styles.updateSection}>
          <label className={styles.updateLabel}>启动默认页面</label>
          <select
            value={settings.defaultPage}
            onChange={(e) => setSettings({ ...settings, defaultPage: e.target.value as SettingsType['defaultPage'] })}
            className={styles.defaultPageSelect}
          >
            <option value="friends">好友列表</option>
            <option value="feed">动态</option>
            <option value="leaderboard">排行榜</option>
            <option value="teams">团队</option>
            <option value="contests">近期比赛</option>
            <option value="report">周报/月报</option>
            <option value="problems">题目练习</option>
            <option value="training">训练看板</option>
          </select>
          <p className={styles.hint}>下次打开应用时自动跳转到此页面</p>
        </div>

        <hr className={styles.divider} />

        {/* ---- 开机自动刷新策略 ---- */}
        <div className={styles.updateSection}>
          <label className={styles.updateLabel}>开机自动刷新</label>
          <div className={styles.notifyRow}>
            <label className={styles.notifyLabel}>只刷新特别关注的好友（更快、省资源）</label>
            <input
              type="checkbox"
              checked={settings.launchRefreshStarredOnly}
              onChange={(e) => setSettings({ ...settings, launchRefreshStarredOnly: e.target.checked })}
              className={styles.notifyToggle}
            />
          </div>
          <p className={styles.hint}>开启后，距上次刷新超过 30 分钟的开机会仅刷新标★的好友；未设置特别关注时仍刷新全部。</p>
        </div>

        <hr className={styles.divider} />

        {/* ---- 系统托盘常驻 ---- */}
        <div className={styles.updateSection}>
          <label className={styles.updateLabel}>系统托盘常驻</label>
          <div className={styles.notifyRow}>
            <label className={styles.notifyLabel}>关闭窗口时驻留托盘（后台运行，定时刷新特别关注好友）</label>
            <input
              type="checkbox"
              checked={settings.enableTray}
              onChange={(e) => setSettings({ ...settings, enableTray: e.target.checked })}
              className={styles.notifyToggle}
            />
          </div>
          <p className={styles.hint}>开启后关闭窗口不会退出应用，而是隐藏到系统托盘，每 20 分钟后台刷新特别关注好友。修改此项需重启应用生效。</p>
        </div>

        <hr className={styles.divider} />

        {/* ---- AI 接口设置 ---- */}
        <div className={styles.updateSection}>
          <label className={styles.updateLabel}>AI 接口</label>
          <p className={styles.updateHint}>配置 OpenAI 兼容的接口后，可在「团队」页使用 AI 分析、推荐题单与知识点清单。</p>

          <div className={styles.field}>
            <label>API 地址</label>
            <input
              type="text"
              value={settings.aiApiBase}
              onChange={(e) => setSettings({ ...settings, aiApiBase: e.target.value })}
              placeholder="https://api.openai.com/v1"
              className={styles.input}
            />
          </div>

          <div className={styles.field}>
            <label>API Key（OpenAI 兼容）</label>
            <input
              type="password"
              value={settings.aiApiKey}
              onChange={(e) => setSettings({ ...settings, aiApiKey: e.target.value })}
              placeholder="sk-..."
              className={styles.input}
            />
          </div>

          <div className={styles.field}>
            <label>模型名称</label>
            <input
              type="text"
              value={settings.aiModel}
              onChange={(e) => setSettings({ ...settings, aiModel: e.target.value })}
              placeholder="gpt-4o-mini"
              className={styles.input}
            />
          </div>

          <button onClick={handleTestAI} className={styles.checkBtn} disabled={aiTesting}>
            {aiTesting ? '测试中...' : '测试连接'}
          </button>
          {aiTestMsg && (
            <p
              className={styles.updateMsg}
              style={{ color: aiTestMsg.startsWith('✓') ? '#4A7C3A' : '#C41E3A' }}
            >
              {aiTestMsg}
            </p>
          )}
        </div>

        <hr className={styles.divider} />

        {/* ---- 通知设置 ---- */}
        <div className={styles.updateSection}>
          <label className={styles.updateLabel}>通知设置</label>

          <div className={styles.notifyRow}>
            <label className={styles.notifyLabel}>好友 Rating 变化通知</label>
            <input
              type="checkbox"
              checked={settings.notifyRatingChange}
              onChange={(e) => setSettings({ ...settings, notifyRatingChange: e.target.checked })}
              className={styles.notifyToggle}
            />
          </div>

          <div className={styles.notifyRow}>
            <label className={styles.notifyLabel}>比赛开始前提醒</label>
            <input
              type="checkbox"
              checked={settings.notifyContestStart}
              onChange={(e) => setSettings({ ...settings, notifyContestStart: e.target.checked })}
              className={styles.notifyToggle}
            />
          </div>

          {settings.notifyContestStart && (
            <div className={styles.notifyRow}>
              <label className={styles.notifyLabel}>提前提醒时间（分钟）</label>
              <input
                type="number"
                min={5}
                max={120}
                value={settings.contestNotifyMinutes}
                onChange={(e) => setSettings({ ...settings, contestNotifyMinutes: Math.max(5, Math.min(120, parseInt(e.target.value) || 30)) })}
                className={styles.notifyInput}
              />
            </div>
          )}

          <button onClick={handleTestNotify} className={styles.checkBtn}>
            测试通知
          </button>
          {notifyTestMsg && (
            <p className={styles.updateMsg} style={{ color: notifyTestMsg.includes('失败') ? '#C41E3A' : '#4A7C3A' }}>
              {notifyTestMsg}
            </p>
          )}
        </div>

        <hr className={styles.divider} />

        {/* ---- 应用更新 ---- */}
        <div className={styles.updateSection}>
          <label className={styles.updateLabel}>应用更新</label>
          <p className={styles.versionText}>当前版本: v{appVersion || '...'}</p>
          <button
            onClick={handleCheckUpdate}
            className={styles.checkBtn}
            disabled={checking || updateStatus === 'downloading' || updateStatus === 'downloaded'}
          >
            {checking ? '检查中...' : '检查更新'}
          </button>
          {renderUpdateStatus()}
          {updateStatus === 'downloaded' && updateInfo?.releaseNotes && (
            <details className={styles.releaseNotes}>
              <summary>更新说明</summary>
              <div className={styles.releaseNotesContent}>
                <Markdown text={updateInfo.releaseNotes ?? ''} />
              </div>
            </details>
          )}
        </div>

        <hr className={styles.divider} />

        {/* ---- 关于 ---- */}
        <div className={styles.updateSection}>
          <button className={styles.changelogBtn} onClick={() => setShowChangelog(true)}>
            📝 查看更新日志
          </button>
        </div>
      </div>
      {showChangelog && <ChangelogModal onClose={() => setShowChangelog(false)} />}
    </div>
  );
}

// 「我的洛谷」概览卡片 — 在 Settings 页直接展示已导入的数据
// 之前只显示一行"已关联 xxx", 用户看不到任何数据是否真的导入, 体验差。
// 此卡片让用户绑定后立即看到：头像、通过题数、提交题数、等级色块,
function MyLuoguSummary({
  account,
  cache,
  onRefresh,
}: {
  account: PlatformAccount;
  cache: LuoguCache | undefined;
  onRefresh: () => Promise<boolean>;
}): JSX.Element {
  const [refreshing, setRefreshing] = useState(false);
  const handleRefresh = async () => {
    setRefreshing(true);
    try {
      await onRefresh();
    } finally {
      setRefreshing(false);
    }
  };
  return (
    <div
      style={{
        display: 'flex',
        alignItems: 'center',
        gap: 12,
        padding: '10px 12px',
        marginTop: 6,
        marginBottom: 10,
        background: 'var(--surface-1, rgba(0,0,0,0.04))',
        borderRadius: 6,
        border: '1px solid var(--border, rgba(0,0,0,0.1))',
      }}
    >
      {cache?.info?.avatar ? (
        <img
          src={cache.info.avatar}
          alt={account.name}
          style={{ width: 44, height: 44, borderRadius: '50%', objectFit: 'cover' }}
        />
      ) : (
        <div
          style={{
            width: 44,
            height: 44,
            borderRadius: '50%',
            background: cache?.info?.color || '#888',
            color: '#FFF',
            display: 'flex',
            alignItems: 'center',
            justifyContent: 'center',
            fontWeight: 700,
            fontSize: 18,
          }}
        >
          {account.name.slice(0, 1).toUpperCase()}
        </div>
      )}
      <div style={{ flex: 1, minWidth: 0 }}>
        <div style={{ fontWeight: 600, fontSize: 14 }}>{account.name}</div>
        {cache ? (
          <div style={{ fontSize: 12, opacity: 0.8, marginTop: 2 }}>
            通过 <strong style={{ color: cache.info.color || 'inherit' }}>{cache.info.passed}</strong> 题 ·
            提交 {cache.info.submitted} 题 · 等级
            <span
              style={{
                display: 'inline-block',
                marginLeft: 4,
                padding: '0 6px',
                borderRadius: 8,
                background: cache.info.color || '#888',
                color: '#FFF',
                fontSize: 11,
                fontWeight: 700,
              }}
            >
              {cache.info.color ? '已导入' : '—'}
            </span>
          </div>
        ) : (
          <div style={{ fontSize: 12, opacity: 0.7, marginTop: 2 }}>
            尚未拉取详情 · 点「重新拉取」即可
          </div>
        )}
      </div>
      <button
        type="button"
        onClick={handleRefresh}
        disabled={refreshing}
        style={{
          padding: '4px 10px',
          fontSize: 12,
          border: '1px solid var(--accent, #4A9EFF)',
          background: 'transparent',
          color: 'var(--accent, #4A9EFF)',
          borderRadius: 4,
          cursor: refreshing ? 'wait' : 'pointer',
          opacity: refreshing ? 0.6 : 1,
        }}
      >
        {refreshing ? '拉取中…' : '重新拉取'}
      </button>
    </div>
  );
}

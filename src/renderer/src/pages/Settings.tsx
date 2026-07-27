import { useEffect, useState, useRef } from 'react';
import type { Settings as SettingsType, UpdateStatus, UpdateInfo, UpdateProgress } from '../types';
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

  // 题目缓存目录相关
  const [currentCacheDir, setCurrentCacheDir] = useState('');
  const [cacheDirMsg, setCacheDirMsg] = useState('');
  const [cacheMsgError, setCacheMsgError] = useState(false);
  const savedDirRef = useRef(''); // 已持久化的目录, 防止主题自动保存泄漏未保存的新目录
  // 登录 Codeforces（在系统浏览器中完成）
  const [loginMsg, setLoginMsg] = useState('');

  // AI 接口测试
  const [aiTesting, setAiTesting] = useState(false);
  const [aiTestMsg, setAiTestMsg] = useState('');

  useEffect(() => {
    (async () => {
      const s = await window.api.store.getSettings();
      setSettings(s);
      savedDirRef.current = s.problemCacheDir;
      const dir = await window.api.problem.getCacheDir();
      setCurrentCacheDir(dir);
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

  // 主题、默认页面、通知设置变化时自动保存（即时生效）
  // 首次从存储加载时跳过写盘,避免无意义回写(在 EPERM 环境下会触发长时间阻塞)
  // 注意: problemCacheDir 不在此自动保存, 仅通过显式的目录设置流程持久化,
  // 避免主题切换等自动保存泄露尚未应用(未迁移)的新目录。
  useEffect(() => {
    if (!settings) return;
    if (firstLoadRef.current) {
      firstLoadRef.current = false;
      return;
    }
    window.api.store.setSettings({ ...settings, problemCacheDir: savedDirRef.current });
  }, [settings?.theme, settings?.defaultPage, settings?.notifyRatingChange, settings?.notifyContestStart, settings?.contestNotifyMinutes, settings?.launchRefreshStarredOnly, settings?.aiApiBase, settings?.aiApiKey, settings?.aiModel, settings?.cppCompilerPath]);

  const handleSave = async () => {
    if (!settings) return;
    savedDirRef.current = settings.problemCacheDir;
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

  const handleClearCache = async () => {
    if (confirm('确定要清空所有缓存数据吗?好友列表不会删除。')) {
      await window.api.store.clearCache();
      alert('缓存已清空');
    }
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

  // 持久化题目缓存目录（更新状态 + 写盘 + 记录已保存值）
  const persistCacheDir = async (dir: string) => {
    const updated = { ...settings!, problemCacheDir: dir };
    setSettings(updated);
    savedDirRef.current = dir;
    await window.api.store.setSettings(updated);
  };

  // 选择目录按钮: 弹系统对话框, 选完自动迁移并保存
  const handleBrowseCacheDir = async () => {
    setCacheDirMsg('');
    setCacheMsgError(false);
    const dir = await window.api.problem.selectCacheDir();
    if (!dir) return;
    try {
      const res = await window.api.problem.setCacheDir(dir);
      if (res.ok) {
        await persistCacheDir(dir);
        setCurrentCacheDir(res.targetDir);
        setCacheDirMsg(
          res.moved > 0
            ? `已移动 ${res.moved} 个文件到新目录`
            : '缓存目录已更新（无已保存的题目需要移动）',
        );
      } else {
        setCacheMsgError(true);
        setCacheDirMsg(`移动失败: ${res.errors.join('; ')}`);
      }
    } catch (e) {
      setCacheMsgError(true);
      setCacheDirMsg(`设置失败: ${(e as Error).message}`);
    }
  };

  // 应用目录按钮: 对输入框中手动填写的目录执行迁移并保存
  const handleApplyCacheDir = async () => {
    setCacheDirMsg('');
    setCacheMsgError(false);
    const dir = (settings?.problemCacheDir ?? '').trim();
    if (!dir) {
      setCacheMsgError(true);
      setCacheDirMsg('请先选择或填写缓存目录');
      return;
    }
    if (dir === currentCacheDir) {
      setCacheDirMsg('目录未变化');
      return;
    }
    try {
      const res = await window.api.problem.setCacheDir(dir);
      if (res.ok) {
        await persistCacheDir(dir);
        setCurrentCacheDir(res.targetDir);
        setCacheDirMsg(
          res.moved > 0
            ? `已移动 ${res.moved} 个文件到新目录`
            : '缓存目录已更新（无已保存的题目需要移动）',
        );
      } else {
        setCacheMsgError(true);
        setCacheDirMsg(`移动失败: ${res.errors.join('; ')}`);
      }
    } catch (e) {
      setCacheMsgError(true);
      setCacheDirMsg(`设置失败: ${(e as Error).message}`);
    }
  };

  // 打开系统默认浏览器到 Codeforces（登录 / 看题面都在本地浏览器完成）
  const handleLoginCf = async () => {
    setLoginMsg('正在用系统浏览器打开 Codeforces...');
    try {
      await window.api.problem.login();
      setLoginMsg('已打开。登录、看题面、提交请在本地浏览器中完成。');
    } catch {
      setLoginMsg('打开浏览器失败，请重试。');
    }
  };

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

        <button onClick={handleClearCache} className={styles.dangerBtn}>
          清空缓存数据
        </button>

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
            onChange={(e) => setSettings({ ...settings, defaultPage: e.target.value as Settings['defaultPage'] })}
            className={styles.defaultPageSelect}
          >
            <option value="friends">好友列表</option>
            <option value="feed">动态</option>
            <option value="leaderboard">排行榜</option>
            <option value="teams">团队</option>
            <option value="contests">近期比赛</option>
            <option value="report">周报/月报</option>
            <option value="problems">题目练习</option>
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
            <label>API Key</label>
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

        {/* ---- 代码运行 (C++ 编译器) ---- */}
        <div className={styles.updateSection}>
          <label className={styles.updateLabel}>代码运行 (C++)</label>
          <p className={styles.updateHint}>在「题目练习」页写 C++ 代码并对拍样例时使用。留空则自动探测系统 PATH 中的 g++；如未加入 PATH，请填写 g++ 可执行文件的完整路径。</p>

          <div className={styles.field}>
            <label>g++ 编译器路径</label>
            <input
              type="text"
              value={settings.cppCompilerPath}
              onChange={(e) => setSettings({ ...settings, cppCompilerPath: e.target.value })}
              placeholder="留空自动探测，或如 D:\\mingw64\\bin\\g++.exe"
              className={styles.input}
            />
          </div>
        </div>

        <hr className={styles.divider} />

        {/* ---- 题目缓存目录 ---- */}
        <div className={styles.updateSection}>
          <label className={styles.updateLabel}>题目缓存目录</label>
          <p className={styles.updateHint}>
            题目与代码会缓存在本地以便离线查看。更换目录会自动将已保存的题目与代码移动到新位置。
          </p>

          <div className={styles.field}>
            <label>当前缓存目录</label>
            <div className={styles.dirRow}>
              <input
                type="text"
                value={settings.problemCacheDir}
                onChange={(e) => setSettings({ ...settings, problemCacheDir: e.target.value })}
                placeholder={currentCacheDir || '默认位置（应用数据目录下的 problem-cache）'}
                className={styles.input}
              />
              <button onClick={handleBrowseCacheDir} className={styles.browseBtn}>
                浏览...
              </button>
              <button onClick={handleApplyCacheDir} className={styles.checkBtn}>
                应用
              </button>
            </div>
          </div>
          {cacheDirMsg && (
            <p
              className={styles.updateMsg}
              style={{ color: cacheMsgError ? '#C41E3A' : '#4A7C3A' }}
            >
              {cacheDirMsg}
            </p>
          )}
        </div>

        <hr className={styles.divider} />

        {/* ---- 在浏览器打开 Codeforces ---- */}
        <div className={styles.updateSection}>
          <label className={styles.updateLabel}>打开 Codeforces（系统浏览器）</label>
          <p className={styles.updateHint}>
            Codeforces 题面被 Cloudflare 反爬拦截，应用内无法加载。点击下方按钮会用你的系统默认浏览器打开
            Codeforces，登录、看题面、提交都请在本地浏览器中完成（应用内的「在浏览器打开原题」也是同样行为）。
          </p>
          <button onClick={handleLoginCf} className={styles.checkBtn}>
            在浏览器打开 Codeforces
          </button>
          {loginMsg && (
            <p className={styles.updateMsg} style={{ color: '#4A7C3A' }}>
              {loginMsg}
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

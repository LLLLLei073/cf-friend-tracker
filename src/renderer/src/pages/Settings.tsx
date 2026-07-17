import { useEffect, useState, useRef } from 'react';
import type { Settings as SettingsType, UpdateStatus, UpdateInfo, UpdateProgress } from '../types';
import ChangelogModal from '../components/ChangelogModal';
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

  useEffect(() => {
    // 获取设置
    (async () => {
      const s = await window.api.store.getSettings();
      setSettings(s);
    })();

    // 获取更新状态
    (async () => {
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
  useEffect(() => {
    if (!settings) return;
    window.api.store.setSettings(settings);
  }, [settings?.theme, settings?.defaultPage, settings?.notifyRatingChange, settings?.notifyContestStart, settings?.contestNotifyMinutes]);

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
          </select>
          <p className={styles.hint}>下次打开应用时自动跳转到此页面</p>
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
                {updateInfo.releaseNotes}
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

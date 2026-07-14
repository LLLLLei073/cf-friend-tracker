import { useEffect, useState } from 'react';
import type { Settings as SettingsType } from '../types';
import styles from '../styles/settings.module.css';

export default function Settings() {
  const [settings, setSettings] = useState<SettingsType | null>(null);
  const [saved, setSaved] = useState(false);
  const [syncMsg, setSyncMsg] = useState('');
  const [syncing, setSyncing] = useState(false);

  useEffect(() => {
    (async () => {
      const s = await window.api.store.getSettings();
      setSettings(s);
    })();
  }, []);

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
          <p className={styles.saved} style={{ color: syncMsg.includes('失败') ? '#ff6b6b' : '#4ecca3' }}>
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
      </div>
    </div>
  );
}

import { useState } from 'react';
import { useNavigate } from 'react-router-dom';
import styles from '../styles/addFriend.module.css';

export default function AddFriend() {
  const navigate = useNavigate();
  const [tab, setTab] = useState<'manual' | 'import'>('manual');

  // 手动添加
  const [handle, setHandle] = useState('');
  const [alias, setAlias] = useState('');
  const [verifying, setVerifying] = useState(false);
  const [verified, setVerified] = useState(false);
  const [verifyError, setVerifyError] = useState('');

  // 导入
  const [myHandle, setMyHandle] = useState('');
  const [apiKey, setApiKey] = useState('');
  const [apiSecret, setApiSecret] = useState('');
  const [importing, setImporting] = useState(false);
  const [friendHandles, setFriendHandles] = useState<string[]>([]);
  const [selected, setSelected] = useState<Set<string>>(new Set());
  const [importError, setImportError] = useState('');

  const verifyHandle = async () => {
    if (!handle.trim()) return;
    setVerifying(true);
    setVerifyError('');
    setVerified(false);
    try {
      const infos = await window.api.cf.getUserInfo([handle.trim()]);
      if (infos.length > 0) {
        setVerified(true);
        setHandle(infos[0].handle);
      }
    } catch (e) {
      setVerifyError(`验证失败: ${(e as Error).message}`);
    } finally {
      setVerifying(false);
    }
  };

  const addFriend = async () => {
    const ok = await window.api.store.addFriend({
      handle: handle.trim(),
      alias: alias.trim(),
      addedAt: Date.now(),
    });
    if (ok) {
      navigate('/friends');
    } else {
      setVerifyError('该好友已存在');
    }
  };

  const importFriends = async () => {
    setImporting(true);
    setImportError('');
    setFriendHandles([]);
    setSelected(new Set());
    try {
      const handles = await window.api.cf.getFriends(
        myHandle.trim(),
        apiKey.trim(),
        apiSecret.trim()
      );
      setFriendHandles(handles);
      setSelected(new Set(handles));
    } catch (e) {
      setImportError(`导入失败: ${(e as Error).message}`);
    } finally {
      setImporting(false);
    }
  };

  const toggleSelect = (h: string) => {
    const next = new Set(selected);
    if (next.has(h)) next.delete(h);
    else next.add(h);
    setSelected(next);
  };

  const confirmImport = async () => {
    for (const h of selected) {
      await window.api.store.addFriend({ handle: h, alias: '', addedAt: Date.now() });
    }
    navigate('/friends');
  };

  return (
    <div>
      <h2 className={styles.heading}>添加好友</h2>
      <div className={styles.tabs}>
        <button
          className={tab === 'manual' ? styles.activeTab : styles.tab}
          onClick={() => setTab('manual')}
        >
          手动添加
        </button>
        <button
          className={tab === 'import' ? styles.activeTab : styles.tab}
          onClick={() => setTab('import')}
        >
          从 CF 导入
        </button>
      </div>

      {tab === 'manual' && (
        <div className={styles.form}>
          <div className={styles.field}>
            <label>CF Handle</label>
            <div className={styles.inputRow}>
              <input
                type="text"
                value={handle}
                onChange={(e) => { setHandle(e.target.value); setVerified(false); setVerifyError(''); }}
                placeholder="输入 Codeforces handle"
                className={styles.input}
              />
              <button onClick={verifyHandle} disabled={verifying || !handle.trim()} className={styles.btn}>
                {verifying ? '验证中...' : '验证'}
              </button>
            </div>
            {verified && <p className={styles.success}>✓ 用户存在</p>}
            {verifyError && <p className={styles.error}>{verifyError}</p>}
          </div>

          <div className={styles.field}>
            <label>备注名(可选)</label>
            <input
              type="text"
              value={alias}
              onChange={(e) => setAlias(e.target.value)}
              placeholder="给好友起个名字"
              className={styles.input}
            />
          </div>

          <button
            onClick={addFriend}
            disabled={!verified}
            className={styles.submitBtn}
          >
            添加好友
          </button>
        </div>
      )}

      {tab === 'import' && (
        <div className={styles.form}>
          <p className={styles.hint}>
            需要在 Codeforces 的 Settings → API 页面生成 API key 和 secret。
          </p>
          <div className={styles.field}>
            <label>你的 CF Handle</label>
            <input
              type="text"
              value={myHandle}
              onChange={(e) => setMyHandle(e.target.value)}
              className={styles.input}
            />
          </div>
          <div className={styles.field}>
            <label>API Key</label>
            <input
              type="text"
              value={apiKey}
              onChange={(e) => setApiKey(e.target.value)}
              className={styles.input}
            />
          </div>
          <div className={styles.field}>
            <label>API Secret</label>
            <input
              type="password"
              value={apiSecret}
              onChange={(e) => setApiSecret(e.target.value)}
              className={styles.input}
            />
          </div>
          <button
            onClick={importFriends}
            disabled={importing || !myHandle.trim() || !apiKey.trim() || !apiSecret.trim()}
            className={styles.submitBtn}
          >
            {importing ? '导入中...' : '获取好友列表'}
          </button>
          {importError && <p className={styles.error}>{importError}</p>}

          {friendHandles.length > 0 && (
            <div className={styles.importList}>
              <div className={styles.importToolbar}>
                <span>共 {friendHandles.length} 个好友,已选 {selected.size}</span>
                <button
                  onClick={() =>
                    setSelected(
                      selected.size === friendHandles.length
                        ? new Set()
                        : new Set(friendHandles)
                    )
                  }
                  className={styles.btn}
                >
                  {selected.size === friendHandles.length ? '取消全选' : '全选'}
                </button>
              </div>
              <div className={styles.handles}>
                {friendHandles.map((h) => (
                  <label key={h} className={styles.checkboxItem}>
                    <input
                      type="checkbox"
                      checked={selected.has(h)}
                      onChange={() => toggleSelect(h)}
                    />
                    {h}
                  </label>
                ))}
              </div>
              <button
                onClick={confirmImport}
                disabled={selected.size === 0}
                className={styles.submitBtn}
              >
                导入选中的 {selected.size} 个好友
              </button>
            </div>
          )}
        </div>
      )}
    </div>
  );
}

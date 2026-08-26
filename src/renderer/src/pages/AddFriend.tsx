import { useState } from 'react';
import { useNavigate } from 'react-router-dom';
import type { PlatformAccount } from '../types';
import styles from '../styles/addFriend.module.css';

export default function AddFriend() {
  const navigate = useNavigate();
  const [tab, setTab] = useState<'manual' | 'import' | 'luogu'>('manual');

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

  // 洛谷添加 (Phase 1a)
  const [luoguQuery, setLuoguQuery] = useState('');
  const [luoguSearching, setLuoguSearching] = useState(false);
  const [luoguResults, setLuoguResults] = useState<PlatformAccount[]>([]);
  const [luoguSelected, setLuoguSelected] = useState<Set<number>>(new Set());
  const [linkTarget, setLinkTarget] = useState<string>(''); // '' = 新建好友, 否则为已存在好友 handle
  const [luoguError, setLuoguError] = useState('');
  const [luoguAdding, setLuoguAdding] = useState(false);
  const [friendsForLink, setFriendsForLink] = useState<{ handle: string; alias: string }[]>([]);

  // ---- 手动添加 ----
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

  // ---- 洛谷 ----
  const loadFriendsForLink = async () => {
    const fr = await window.api.store.getFriends();
    setFriendsForLink(fr.map((f) => ({ handle: f.handle, alias: f.alias || f.handle })));
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

  // ---- 洛谷 ----
  const searchLuogu = async () => {
    if (!luoguQuery.trim()) return;
    setLuoguSearching(true);
    setLuoguError('');
    setLuoguResults([]);
    setLuoguSelected(new Set());
    try {
      const res = await window.api.luogu.search(luoguQuery.trim());
      setLuoguResults(res);
      setLuoguSelected(new Set(res.map((r) => r.uid)));
    } catch (e) {
      setLuoguError(`搜索失败: ${(e as Error).message}`);
    } finally {
      setLuoguSearching(false);
    }
  };

  const toggleLuoguSelect = (uid: number) => {
    const next = new Set(luoguSelected);
    if (next.has(uid)) next.delete(uid);
    else next.add(uid);
    setLuoguSelected(next);
  };

  const addLuogu = async () => {
    if (luoguSelected.size === 0) return;
    setLuoguAdding(true);
    setLuoguError('');
    try {
      const picked = luoguResults.filter((r) => luoguSelected.has(r.uid));
      for (const acc of picked) {
        if (linkTarget) {
          // 关联到已有好友(在其 Friend 上挂 luogu 字段)
          await window.api.store.linkLuogu(linkTarget, { uid: acc.uid, name: acc.name });
        } else {
          // 新建纯洛谷好友: handle 用合成主键 luogu:{uid}, 避免与 CF handle 冲突
          const ok = await window.api.store.addFriend({
            handle: `luogu:${acc.uid}`,
            alias: acc.name,
            addedAt: Date.now(),
            luogu: { uid: acc.uid, name: acc.name },
          });
          if (!ok) setLuoguError(`「${acc.name}」已存在, 跳过`);
        }
        // 绑定后立即拉一次详情写 LuoguCache: FriendRow 徽章 / 排行榜洛谷 tab 立即可见,
        // 不必等用户再去点 Sidebar 全量刷新。失败静默——缓存层会留空, 但不会阻断用户的添加意图。
        window.api.luogu
          .refreshByUid(acc.uid)
          .catch((e) => console.warn(`luogu refreshByUid(${acc.uid}) failed:`, e));
      }
      navigate('/friends');
    } catch (e) {
      setLuoguError(`添加失败: ${(e as Error).message}`);
    } finally {
      setLuoguAdding(false);
    }
  };

  // ---- 牛客已移除 (Phase 1b 退役, 2026-08) ----

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
        <button
          className={tab === 'luogu' ? styles.activeTab : styles.tab}
          onClick={() => { setTab('luogu'); loadFriendsForLink(); }}
        >
          从洛谷添加
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

      {tab === 'luogu' && (
        <div className={styles.form}>
          <p className={styles.hint}>
            按洛谷用户名搜索并添加。可关联到已有好友(在其上挂洛谷账号),或新建纯洛谷好友。
          </p>
          <div className={styles.field}>
            <label>洛谷用户名</label>
            <div className={styles.inputRow}>
              <input
                type="text"
                value={luoguQuery}
                onChange={(e) => setLuoguQuery(e.target.value)}
                placeholder="输入洛谷用户名"
                className={styles.input}
                onKeyDown={(e) => { if (e.key === 'Enter') searchLuogu(); }}
              />
              <button onClick={searchLuogu} disabled={luoguSearching || !luoguQuery.trim()} className={styles.btn}>
                {luoguSearching ? '搜索中...' : '搜索'}
              </button>
            </div>
          </div>

          <div className={styles.field}>
            <label>关联到已有好友(可选,留空则新建洛谷好友)</label>
            <select
              value={linkTarget}
              onChange={(e) => setLinkTarget(e.target.value)}
              className={styles.input}
            >
              <option value="">＋ 新建洛谷好友</option>
              {friendsForLink.map((f) => (
                <option key={f.handle} value={f.handle}>
                  关联到：{f.alias}
                </option>
              ))}
            </select>
          </div>

          {luoguError && <p className={styles.error}>{luoguError}</p>}

          {luoguResults.length > 0 && (
            <div className={styles.importList}>
              <div className={styles.importToolbar}>
                <span>共 {luoguResults.length} 个结果,已选 {luoguSelected.size}</span>
                <button
                  onClick={() =>
                    setLuoguSelected(
                      luoguSelected.size === luoguResults.length
                        ? new Set()
                        : new Set(luoguResults.map((r) => r.uid))
                    )
                  }
                  className={styles.btn}
                >
                  {luoguSelected.size === luoguResults.length ? '取消全选' : '全选'}
                </button>
              </div>
              <div className={styles.handles}>
                {luoguResults.map((r) => (
                  <label key={r.uid} className={styles.checkboxItem}>
                    <input
                      type="checkbox"
                      checked={luoguSelected.has(r.uid)}
                      onChange={() => toggleLuoguSelect(r.uid)}
                    />
                    {r.name}
                    <span className={styles.subHint}>#{r.uid}</span>
                  </label>
                ))}
              </div>
              <button
                onClick={addLuogu}
                disabled={luoguAdding || luoguSelected.size === 0}
                className={styles.submitBtn}
              >
                {luoguAdding ? '添加中...' : `添加选中的 ${luoguSelected.size} 个`}
              </button>
            </div>
          )}
        </div>
      )}
    </div>
  );
}

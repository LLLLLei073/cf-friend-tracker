import { Routes, Route, Navigate } from 'react-router-dom';
import { useEffect, useState } from 'react';
import { useNavigate } from 'react-router-dom';
import Sidebar from './components/Sidebar';
import FriendList from './pages/FriendList';
import FriendDetail from './pages/FriendDetail';
import AddFriend from './pages/AddFriend';
import Settings from './pages/Settings';
import Leaderboard from './pages/Leaderboard';
import Teams from './pages/Teams';
import Contests from './pages/Contests';
import Compare from './pages/Compare';
import Report from './pages/Report';
import Feed from './pages/Feed';
import Problems from './pages/Problems';
import ProblemView from './pages/ProblemView';
import ErrorBoundary from './components/ErrorBoundary';
import ChangelogModal from './components/ChangelogModal';
import { CHANGELOG } from './data/changelog';

export default function App() {
  const navigate = useNavigate();
  const [ready, setReady] = useState(false);
  const [showChangelog, setShowChangelog] = useState(false);
  const [appVersion, setAppVersion] = useState('');

  // 应用主题 + 启动时跳转到默认页面 + 更新日志检查
  useEffect(() => {
    (async () => {
      const settings = await window.api.store.getSettings();
      // 统一从主进程拿应用版本, 避免硬编码常量与 package.json 漂移
      setAppVersion(await window.api.app.getVersion());

      // 跳转到默认页面（仅首次加载时，URL 为根路径）
      if (window.location.hash === '#/' || window.location.hash === '' || window.location.hash === '#') {
        navigate(`/${settings.defaultPage}`, { replace: true });
      }

      // 检查是否需要显示更新日志
      const latestVersion = CHANGELOG[0].version;
      if (settings.lastViewedChangelog !== latestVersion) {
        setShowChangelog(true);
        // 标记已查看
        await window.api.store.setSettings({
          ...settings,
          lastViewedChangelog: latestVersion,
        });
      }

      const applyTheme = (isDark: boolean) => {
        document.documentElement.classList.toggle('dark', isDark);
      };

      if (settings.theme === 'dark') {
        applyTheme(true);
      } else if (settings.theme === 'light') {
        applyTheme(false);
      } else {
        // system
        const mq = window.matchMedia('(prefers-color-scheme: dark)');
        applyTheme(mq.matches);
        const handler = (e: MediaQueryListEvent) => applyTheme(e.matches);
        mq.addEventListener('change', handler);
        setReady(true);
        return () => mq.removeEventListener('change', handler);
      }
      setReady(true);
    })();
  }, []);

  if (!ready) {
    return (
      <div style={{ display: 'flex', height: '100vh', background: 'var(--bg-base)' }}>
        <Sidebar />
        <main style={{ flex: 1, overflow: 'auto', padding: '28px 32px 40px', backgroundColor: 'var(--bg-base)' }} />
      </div>
    );
  }

  return (
    <div style={{ display: 'flex', height: '100vh', background: 'var(--bg-base)' }}>
      <Sidebar />
      <main style={{
        flex: 1,
        overflow: 'auto',
        padding: '28px 32px 40px',
        backgroundColor: 'var(--bg-base)',
        backgroundImage: 'repeating-linear-gradient(to bottom, transparent, transparent 27px, var(--rule-line) 27px, var(--rule-line) 28px)',
        backgroundAttachment: 'local',
      }}>
        <Routes>
          <Route path="/" element={<FriendList />} />
          <Route path="/friends" element={<FriendList />} />
          <Route path="/friends/:handle" element={<FriendDetail />} />
          <Route path="/feed" element={<Feed />} />
          <Route path="/leaderboard" element={<Leaderboard />} />
          <Route path="/teams" element={<Teams />} />
          <Route path="/contests" element={<Contests />} />
          <Route path="/problems" element={<Problems />} />
          <Route path="/problems/:contestId/:index" element={<ProblemView />} />
          <Route path="/compare" element={<Compare />} />
          <Route path="/report" element={<Report />} />
          <Route path="/add" element={<AddFriend />} />
          <Route path="/settings" element={<Settings />} />
        </Routes>
      </main>
      {showChangelog && (
        <ChangelogModal onClose={() => setShowChangelog(false)} initialVersion={appVersion || CHANGELOG[0]?.version} />
      )}
    </div>
  );
}

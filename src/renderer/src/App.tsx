import { Routes, Route, Navigate } from 'react-router-dom';
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

export default function App() {
  return (
    <div style={{ display: 'flex', height: '100vh' }}>
      <Sidebar />
      <main style={{ flex: 1, overflow: 'auto', padding: '28px 32px 40px' }}>
        <Routes>
          <Route path="/" element={<Navigate to="/friends" replace />} />
          <Route path="/friends" element={<FriendList />} />
          <Route path="/friends/:handle" element={<FriendDetail />} />
          <Route path="/leaderboard" element={<Leaderboard />} />
          <Route path="/teams" element={<Teams />} />
          <Route path="/contests" element={<Contests />} />
          <Route path="/compare" element={<Compare />} />
          <Route path="/report" element={<Report />} />
          <Route path="/add" element={<AddFriend />} />
          <Route path="/settings" element={<Settings />} />
        </Routes>
      </main>
    </div>
  );
}

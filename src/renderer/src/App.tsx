import { Routes, Route, Navigate } from 'react-router-dom';
import Sidebar from './components/Sidebar';
import FriendList from './pages/FriendList';
import FriendDetail from './pages/FriendDetail';
import AddFriend from './pages/AddFriend';
import Settings from './pages/Settings';

export default function App() {
  return (
    <div style={{ display: 'flex', height: '100vh' }}>
      <Sidebar />
      <main style={{ flex: 1, overflow: 'auto', padding: '20px' }}>
        <Routes>
          <Route path="/" element={<Navigate to="/friends" replace />} />
          <Route path="/friends" element={<FriendList />} />
          <Route path="/friends/:handle" element={<FriendDetail />} />
          <Route path="/add" element={<AddFriend />} />
          <Route path="/settings" element={<Settings />} />
        </Routes>
      </main>
    </div>
  );
}

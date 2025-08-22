import { BrowserRouter as Router, Routes, Route } from 'react-router-dom';
import { AuthProvider } from './contexts/AuthContext';
import ProtectedRoute from './components/ProtectedRoute';
import Navbar from './components/Navbar';
import Home from './pages/Home';
import Login from './pages/Login';
import Register from './pages/Register';
import Knowledge from './pages/Knowledge';
import Chat from './pages/Chat';
import Profile from './pages/Profile';
import { Toaster } from 'sonner';

function App() {
  return (
    <AuthProvider>
      <Router>
        <div className="App min-h-screen bg-gray-50">
          <Navbar />
          <Toaster position="top-right" richColors />
          <Routes>
            {/* 公开路由 */}
            <Route path="/login" element={<Login />} />
            <Route path="/register" element={<Register />} />
            
            {/* 受保护的路由 */}
            <Route
              path="/"
              element={
                <ProtectedRoute>
                  <Home />
                </ProtectedRoute>
              }
            />
            <Route
               path="/knowledge"
               element={
                 <ProtectedRoute>
                   <Knowledge />
                 </ProtectedRoute>
               }
             />
            <Route
               path="/chat"
               element={
                 <ProtectedRoute>
                   <Chat />
                 </ProtectedRoute>
               }
             />
            <Route
               path="/profile"
               element={
                 <ProtectedRoute>
                   <Profile />
                 </ProtectedRoute>
               }
             />
          </Routes>
        </div>
      </Router>
    </AuthProvider>
  );
}

export default App;

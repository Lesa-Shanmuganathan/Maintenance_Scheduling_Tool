import React, { useState, useEffect, useCallback } from 'react';
import { BrowserRouter as Router, Routes, Route, NavLink, useLocation, useNavigate } from 'react-router-dom';
import { AppBar, Toolbar, Typography, Container, IconButton } from '@mui/material';
import SettingsIcon from '@mui/icons-material/Settings';
import SynthesisDashboard from './pages/SynthesisDashboard';
import MainPage from './pages/MainPage';
import PendingReviewPage from './pages/PendingReviewPage';
import LogsPage from './pages/LogsPage';
import AdminPage from './pages/AdminPage';
import { fetchPendingReview } from './api';
import logo from './assets/logo.png';

const Header = () => {
  const navigate = useNavigate();
  return (
    <AppBar 
      position="static" 
      elevation={0} 
      sx={{ 
        background: 'linear-gradient(90deg, #00A651 0%, #0093AF 100%)' 
      }} 
      className="py-6 rounded-none"
    >
      <Container maxWidth="xl">
        <Toolbar disableGutters className="flex justify-between">
          <div className="flex items-center">
            <div className="mr-8 flex items-center">
              <img src={logo} alt="AVL Logo" className="h-[75px] object-contain" />
            </div>
            <div className="flex flex-col">
              <Typography variant="h4" component="div" className="text-white font-bold tracking-tight leading-none mb-2">
                Maintenance Scheduling Tool
              </Typography>
              <Typography variant="subtitle1" className="text-white/90 font-medium tracking-wide">
                Manage and track preventive maintenance of equipment
              </Typography>
            </div>
          </div>
          <div>
            <IconButton onClick={() => navigate('/admin')} sx={{ color: 'white' }}>
              <SettingsIcon fontSize="large" />
            </IconButton>
          </div>
        </Toolbar>
      </Container>
    </AppBar>
  );
};

const Navigation = () => {
  return (
    <nav className="border-b border-gray-200 bg-white flex justify-center sticky top-0 z-10 shrink-0">
      <Container maxWidth="xl">
        <div className="flex gap-2">
          <NavLink 
            to="/" 
            className={({ isActive }) => 
              `px-6 py-4 no-underline font-semibold border-b-3 transition-colors rounded-none ${
                isActive ? 'text-[#00A651] border-[#00A651]' : 'text-[#64748b] border-transparent hover:text-gray-900'
              }`
            }
            end
          >
            Synthesis
          </NavLink>
          <NavLink 
            to="/environments" 
            className={({ isActive }) => 
              `px-6 py-4 no-underline font-semibold border-b-3 transition-colors rounded-none ${
                isActive ? 'text-[#00A651] border-[#00A651]' : 'text-[#64748b] border-transparent hover:text-gray-900'
              }`
            }
          >
            Environments
          </NavLink>
          <NavLink 
            to="/logs" 
            className={({ isActive }) => 
              `px-6 py-4 no-underline font-semibold border-b-3 transition-colors rounded-none ${
                isActive ? 'text-[#00A651] border-[#00A651]' : 'text-[#64748b] border-transparent hover:text-gray-900'
              }`
            }
          >
            Logs
          </NavLink>
        </div>
      </Container>
    </nav>
  );
};

const MainContent = ({ pendingCount, onPendingCountChange, refreshKey, onDataMutated }) => {
  const location = useLocation();
  
  return (
    <div className="flex-1 flex flex-col h-full overflow-hidden">
      <Routes location={location}>
        <Route path="/" element={<SynthesisDashboard refreshKey={refreshKey} />} />
        <Route path="/environments" element={<MainPage refreshKey={refreshKey} onDataMutated={onDataMutated} />} />
        <Route path="/pending" element={<PendingReviewPage onCountChange={onPendingCountChange} onDataMutated={onDataMutated} />} />
        <Route path="/logs" element={<LogsPage />} />
        <Route path="/admin" element={<AdminPage />} />
      </Routes>
    </div>
  );
};

function App() {
  const [pendingCount, setPendingCount] = useState(0);
  const [refreshKey, setRefreshKey] = useState(0);

  const loadPendingCount = useCallback(async () => {
    try {
      const res = await fetchPendingReview();
      setPendingCount(res.data.length);
    } catch (err) {
      console.error(err);
    }
  }, []);

  const handleDataMutated = useCallback(() => {
    setRefreshKey(prev => prev + 1);
    loadPendingCount();
  }, [loadPendingCount]);

  useEffect(() => {
    loadPendingCount();
  }, [loadPendingCount]);

  return (
    <Router>
      <div className="flex flex-col h-screen bg-[#F8F9FA] overflow-hidden">
        <Header />
        <Navigation />
        <Container maxWidth="xl" className="grow flex flex-col py-8 overflow-hidden">
          <MainContent
            pendingCount={pendingCount}
            onPendingCountChange={setPendingCount}
            refreshKey={refreshKey}
            onDataMutated={handleDataMutated}
          />
        </Container>
      </div>
    </Router>
  );
}

export default App;

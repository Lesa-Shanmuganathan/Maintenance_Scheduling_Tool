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
        background: 'linear-gradient(160deg, #005A99 0%, #00A4C7 55%, #01C9B2 100%)',
        boxShadow: '0 2px 8px rgba(0, 90, 153, 0.15)',
        borderRadius: 0,
      }} 
    >
      <Container maxWidth="xl">
        <Toolbar disableGutters sx={{ minHeight: '70px !important', py: '8px' }} className="flex justify-between">
          <div className="flex items-center gap-4">
            <img src={logo} alt="AVL Logo" className="h-[52px] object-contain" />
            <div className="flex flex-col">
              <Typography variant="body1" component="div" sx={{ color: '#fff', fontWeight: 700, letterSpacing: '0.01em', lineHeight: 1.3 }}>
                Maintenance Scheduling Tool
              </Typography>
              <Typography variant="caption" sx={{ color: 'rgba(255,255,255,0.8)', fontWeight: 400, letterSpacing: '0.02em', fontSize: '0.72rem' }}>
                Manage and track preventive maintenance of equipment
              </Typography>
            </div>
          </div>
          <div>
            <IconButton onClick={() => navigate('/admin')} sx={{ color: 'white' }}>
              <SettingsIcon />
            </IconButton>
          </div>
        </Toolbar>
      </Container>
    </AppBar>
  );
};

const Navigation = () => {
  return (
    <nav
      className="bg-white flex justify-center sticky top-0 z-10 shrink-0"
      style={{ borderBottom: '1px solid rgba(0, 90, 153, 0.12)', boxShadow: '0 2px 8px rgba(0, 90, 153, 0.05)' }}
    >
      <Container maxWidth="xl">
        <div className="flex gap-1">
          <NavLink 
            to="/" 
            className={({ isActive }) => 
              `px-6 py-4 no-underline font-semibold border-b-[3px] transition-all rounded-none ${
                isActive
                  ? 'text-[#005A99] border-[#005A99] bg-[rgba(0,90,153,0.04)]'
                  : 'text-[#64748b] border-transparent hover:text-[#005A99] hover:bg-[rgba(0,90,153,0.03)]'
              }`
            }
            end
          >
            Synthesis
          </NavLink>
          <NavLink 
            to="/environments" 
            className={({ isActive }) => 
              `px-6 py-4 no-underline font-semibold border-b-[3px] transition-all rounded-none ${
                isActive
                  ? 'text-[#005A99] border-[#005A99] bg-[rgba(0,90,153,0.04)]'
                  : 'text-[#64748b] border-transparent hover:text-[#005A99] hover:bg-[rgba(0,90,153,0.03)]'
              }`
            }
          >
            Environments
          </NavLink>
          <NavLink 
            to="/logs" 
            className={({ isActive }) => 
              `px-6 py-4 no-underline font-semibold border-b-[3px] transition-all rounded-none ${
                isActive
                  ? 'text-[#005A99] border-[#005A99] bg-[rgba(0,90,153,0.04)]'
                  : 'text-[#64748b] border-transparent hover:text-[#005A99] hover:bg-[rgba(0,90,153,0.03)]'
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
      <div className="flex flex-col h-screen bg-[#f0f4f8] overflow-hidden">
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

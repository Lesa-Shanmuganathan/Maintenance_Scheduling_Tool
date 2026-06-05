import React, { useState, useEffect } from 'react';
import { 
  adminLogin,
  fetchAdminEnvironments, createAdminEnvironment, updateAdminEnvironment, deleteAdminEnvironment,
  createAdminLocation, updateAdminLocation, deleteAdminLocation
} from '../api';
import { Typography, Paper, Table, TableBody, TableCell, TableContainer, TableHead, TableRow, Button, TextField, IconButton, Select, MenuItem } from '@mui/material';
import EditIcon from '@mui/icons-material/Edit';
import DeleteIcon from '@mui/icons-material/Delete';

const AdminPage = () => {
  const [environments, setEnvironments] = useState([]);
  const [isAuthenticated, setIsAuthenticated] = useState(() => Boolean(localStorage.getItem('adminToken')));
  const [username, setUsername] = useState('');
  const [password, setPassword] = useState('');
  const [authError, setAuthError] = useState('');
  const [isLoggingIn, setIsLoggingIn] = useState(false);
  
  // Environment add/edit states
  const [newEnvName, setNewEnvName] = useState('');
  const [newEnvDesc, setNewEnvDesc] = useState('');
  const [editingEnvId, setEditingEnvId] = useState(null);
  const [editEnvName, setEditEnvName] = useState('');
  const [editEnvDesc, setEditEnvDesc] = useState('');
  const [newLocationEnvId, setNewLocationEnvId] = useState('');
  const [newLocationCode, setNewLocationCode] = useState('');
  const [newLocationDesc, setNewLocationDesc] = useState('');
  const [editingLocationId, setEditingLocationId] = useState(null);
  const [editLocationCode, setEditLocationCode] = useState('');
  const [editLocationDesc, setEditLocationDesc] = useState('');

  const loadEnvironments = async () => {
    try {
      const res = await fetchAdminEnvironments();
      setEnvironments(res.data);
    } catch (err) {
      if (err.response?.status === 401) {
        localStorage.removeItem('adminToken');
        setIsAuthenticated(false);
        setAuthError('Admin session expired. Please log in again.');
        return;
      }
      console.error(err);
    }
  };

  useEffect(() => {
    if (isAuthenticated) {
      loadEnvironments();
    }
  }, [isAuthenticated]);

  useEffect(() => {
    if (!newLocationEnvId && environments.length > 0) {
      setNewLocationEnvId(environments[0].id);
    }
  }, [environments, newLocationEnvId]);

  const handleLogin = async (event) => {
    event.preventDefault();
    setIsLoggingIn(true);
    setAuthError('');
    try {
      const res = await adminLogin(username, password);
      localStorage.setItem('adminToken', res.data.token);
      setIsAuthenticated(true);
      setPassword('');
    } catch (err) {
      setAuthError(err.response?.data?.error || 'Unable to log in');
    } finally {
      setIsLoggingIn(false);
    }
  };

  const handleLogout = () => {
    localStorage.removeItem('adminToken');
    setIsAuthenticated(false);
    setEnvironments([]);
    setUsername('');
    setPassword('');
  };

  const handleAddEnv = async () => {
    if (!newEnvName) return;
    await createAdminEnvironment({ name: newEnvName, description: newEnvDesc });
    setNewEnvName('');
    setNewEnvDesc('');
    loadEnvironments();
  };

  const handleUpdateEnv = async (id) => {
    await updateAdminEnvironment(id, { name: editEnvName, description: editEnvDesc });
    setEditingEnvId(null);
    loadEnvironments();
  };

  const handleDeleteEnv = async (env) => {
    const msg = env.equipment_count > 0 
      ? `This environment has ${env.equipment_count} equipment records. Deleting it will also remove all associated equipment. This cannot be undone.`
      : `Are you sure you want to delete this environment?`;
    if (window.confirm(msg)) {
      await deleteAdminEnvironment(env.id);
      loadEnvironments();
    }
  };

  const handleAddLocation = async () => {
    if (!newLocationEnvId || !newLocationCode.trim()) return;
    await createAdminLocation({
      environment_id: newLocationEnvId,
      code: newLocationCode,
      description: newLocationDesc
    });
    setNewLocationCode('');
    setNewLocationDesc('');
    loadEnvironments();
  };

  const handleUpdateLocation = async (id) => {
    await updateAdminLocation(id, {
      code: editLocationCode,
      description: editLocationDesc
    });
    setEditingLocationId(null);
    loadEnvironments();
  };

  const handleDeleteLocation = async (location) => {
    if (window.confirm(`Delete location ${location.code}? Equipment assigned to it will become unassigned.`)) {
      await deleteAdminLocation(location.id);
      loadEnvironments();
    }
  };

  const locations = environments.flatMap(env => (env.locations || []).map(loc => ({ ...loc, environment_name: env.name })));

  if (!isAuthenticated) {
    return (
      <div className="h-full flex items-center justify-center">
        <form onSubmit={handleLogin} className="w-full max-w-sm bg-white border border-gray-100 shadow-sm p-6 flex flex-col gap-4">
          <Typography variant="h5" className="text-[#00A651] font-bold">Admin Login</Typography>
          <TextField
            label="Username"
            value={username}
            onChange={e => setUsername(e.target.value)}
            size="small"
            autoFocus
          />
          <TextField
            label="Password"
            type="password"
            value={password}
            onChange={e => setPassword(e.target.value)}
            size="small"
          />
          {authError && <Typography className="text-sm text-red-600">{authError}</Typography>}
          <Button type="submit" variant="contained" disabled={isLoggingIn} className="bg-black! text-white! rounded-none">
            {isLoggingIn ? 'Logging in...' : 'Login'}
          </Button>
        </form>
      </div>
    );
  }

  return (
    <div className="h-full flex flex-col gap-6 overflow-y-auto">
      <div className="bg-white p-6 border border-gray-100 shadow-sm shrink-0">
        <div className="flex items-center justify-between gap-4 mb-4">
          <Typography variant="h5" className="text-[#00A651] font-bold">Manage Environments</Typography>
          <Button variant="outlined" className="rounded-none border-gray-300! text-gray-700!" onClick={handleLogout}>
            Logout
          </Button>
        </div>
        <TableContainer component={Paper} elevation={0} className="border border-gray-100 rounded-none shadow-sm mb-4">
          <Table>
            <TableHead className="bg-gray-50/80">
              <TableRow>
                <TableCell className="font-bold! text-[#64748b]!">NAME</TableCell>
                <TableCell className="font-bold! text-[#64748b]!">DESCRIPTION</TableCell>
                <TableCell className="font-bold! text-[#64748b]!">EQUIPMENT COUNT</TableCell>
                <TableCell className="font-bold! text-[#64748b]!">ACTIONS</TableCell>
              </TableRow>
            </TableHead>
            <TableBody>
              {environments.map(env => (
                <TableRow key={env.id} hover>
                  <TableCell>
                    {editingEnvId === env.id ? (
                      <TextField size="small" value={editEnvName} onChange={e => setEditEnvName(e.target.value)} />
                    ) : env.name}
                  </TableCell>
                  <TableCell>
                    {editingEnvId === env.id ? (
                      <TextField size="small" fullWidth value={editEnvDesc} onChange={e => setEditEnvDesc(e.target.value)} />
                    ) : env.description}
                  </TableCell>
                  <TableCell>{env.equipment_count}</TableCell>
                  <TableCell>
                    {editingEnvId === env.id ? (
                      <div className="flex gap-2">
                        <Button size="small" variant="contained" className="bg-[#00A651]! rounded-none" onClick={() => handleUpdateEnv(env.id)}>Save</Button>
                        <Button size="small" variant="outlined" className="rounded-none" onClick={() => setEditingEnvId(null)}>Cancel</Button>
                      </div>
                    ) : (
                      <div className="flex gap-2">
                        <IconButton size="small" onClick={() => { setEditingEnvId(env.id); setEditEnvName(env.name); setEditEnvDesc(env.description || ''); }}>
                          <EditIcon fontSize="small" />
                        </IconButton>
                        <IconButton size="small" className="text-red-500!" onClick={() => handleDeleteEnv(env)}>
                          <DeleteIcon fontSize="small" />
                        </IconButton>
                      </div>
                    )}
                  </TableCell>
                </TableRow>
              ))}
            </TableBody>
          </Table>
        </TableContainer>
        <div className="flex gap-4 items-center">
          <TextField size="small" label="New Environment Name" value={newEnvName} onChange={e => setNewEnvName(e.target.value)} />
          <TextField size="small" label="Description" className="flex-1" value={newEnvDesc} onChange={e => setNewEnvDesc(e.target.value)} />
          <Button variant="contained" className="bg-black! text-white! rounded-none" onClick={handleAddEnv}>Add Environment</Button>
        </div>
      </div>

      <div className="bg-white p-6 border border-gray-100 shadow-sm shrink-0">
        <Typography variant="h5" className="text-[#00A651] font-bold mb-4">Manage Locations</Typography>
        <TableContainer component={Paper} elevation={0} className="border border-gray-100 rounded-none shadow-sm mb-4">
          <Table>
            <TableHead className="bg-gray-50/80">
              <TableRow>
                <TableCell className="font-bold! text-[#64748b]!">LOCATION</TableCell>
                <TableCell className="font-bold! text-[#64748b]!">ENVIRONMENT</TableCell>
                <TableCell className="font-bold! text-[#64748b]!">DESCRIPTION</TableCell>
                <TableCell className="font-bold! text-[#64748b]!">ACTIONS</TableCell>
              </TableRow>
            </TableHead>
            <TableBody>
              {locations.map(location => (
                <TableRow key={location.id} hover>
                  <TableCell>
                    {editingLocationId === location.id ? (
                      <TextField size="small" value={editLocationCode} onChange={e => setEditLocationCode(e.target.value)} />
                    ) : location.code}
                  </TableCell>
                  <TableCell>{location.environment_name}</TableCell>
                  <TableCell>
                    {editingLocationId === location.id ? (
                      <TextField size="small" fullWidth value={editLocationDesc} onChange={e => setEditLocationDesc(e.target.value)} />
                    ) : location.description || '-'}
                  </TableCell>
                  <TableCell>
                    {editingLocationId === location.id ? (
                      <div className="flex gap-2">
                        <Button size="small" variant="contained" className="bg-[#00A651]! rounded-none" onClick={() => handleUpdateLocation(location.id)}>Save</Button>
                        <Button size="small" variant="outlined" className="rounded-none" onClick={() => setEditingLocationId(null)}>Cancel</Button>
                      </div>
                    ) : (
                      <div className="flex gap-2">
                        <IconButton size="small" onClick={() => { setEditingLocationId(location.id); setEditLocationCode(location.code); setEditLocationDesc(location.description || ''); }}>
                          <EditIcon fontSize="small" />
                        </IconButton>
                        <IconButton size="small" className="text-red-500!" onClick={() => handleDeleteLocation(location)}>
                          <DeleteIcon fontSize="small" />
                        </IconButton>
                      </div>
                    )}
                  </TableCell>
                </TableRow>
              ))}
            </TableBody>
          </Table>
        </TableContainer>
        <div className="grid grid-cols-1 md:grid-cols-[220px_180px_1fr_auto] gap-4 items-center">
          <Select size="small" value={newLocationEnvId} onChange={e => setNewLocationEnvId(e.target.value)}>
            {environments.map(env => (
              <MenuItem key={env.id} value={env.id}>{env.name}</MenuItem>
            ))}
          </Select>
          <TextField size="small" label="Location Code" value={newLocationCode} onChange={e => setNewLocationCode(e.target.value)} />
          <TextField size="small" label="Description" value={newLocationDesc} onChange={e => setNewLocationDesc(e.target.value)} />
          <Button variant="contained" className="bg-black! text-white! rounded-none" onClick={handleAddLocation}>Add Location</Button>
        </div>
      </div>
    </div>
  );
};

export default AdminPage;

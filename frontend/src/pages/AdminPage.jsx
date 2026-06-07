import React, { useState, useEffect } from 'react';
import { 
  adminLogin,
  fetchAdminEnvironments, createAdminEnvironment, updateAdminEnvironment, deleteAdminEnvironment,
  createAdminLocation, updateAdminLocation, deleteAdminLocation
} from '../api';
import { Typography, Paper, Table, TableBody, TableCell, TableContainer, TableHead, TableRow, Button, TextField, IconButton } from '@mui/material';
import AddIcon from '@mui/icons-material/Add';
import EditIcon from '@mui/icons-material/Edit';
import DeleteIcon from '@mui/icons-material/Delete';
import KeyboardArrowDownIcon from '@mui/icons-material/KeyboardArrowDown';
import KeyboardArrowRightIcon from '@mui/icons-material/KeyboardArrowRight';
import LogoutIcon from '@mui/icons-material/Logout';

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
  const [newLocations, setNewLocations] = useState({});
  const [editingLocationId, setEditingLocationId] = useState(null);
  const [editLocationCode, setEditLocationCode] = useState('');
  const [editLocationDesc, setEditLocationDesc] = useState('');
  const [expandedEnvId, setExpandedEnvId] = useState(null);

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

  const updateNewLocation = (envId, field, value) => {
    setNewLocations(prev => ({
      ...prev,
      [envId]: {
        code: '',
        description: '',
        ...(prev[envId] || {}),
        [field]: value
      }
    }));
  };

  const handleAddLocation = async (envId) => {
    const newLocation = newLocations[envId] || {};
    if (!envId || !newLocation.code?.trim()) return;
    await createAdminLocation({
      environment_id: envId,
      code: newLocation.code,
      description: newLocation.description || ''
    });
    setNewLocations(prev => ({
      ...prev,
      [envId]: { code: '', description: '' }
    }));
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
    <div className="h-full min-h-0 overflow-hidden">
      <div className="h-full min-h-0 bg-white border border-gray-100 shadow-sm flex flex-col">
        <div className="shrink-0 px-6 py-5 border-b border-gray-100 flex flex-col gap-4 md:flex-row md:items-center md:justify-between">
          <div>
            <Typography variant="h5" className="text-[#00A651] font-bold">Admin Console</Typography>
            <Typography variant="body2" className="text-gray-500 mt-1">
              Manage environments and their assigned locations.
            </Typography>
          </div>
          <Button
            variant="outlined"
            startIcon={<LogoutIcon />}
            className="rounded-none border-gray-300! text-gray-700! normal-case self-start md:self-auto"
            onClick={handleLogout}
          >
            Logout
          </Button>
        </div>

        <TableContainer component={Paper} elevation={0} className="flex-1 min-h-0 overflow-auto rounded-none shadow-none">
          <Table
            stickyHeader
            size="small"
            sx={{
              minWidth: 980,
              tableLayout: 'fixed',
              '& .MuiTableCell-root': {
                borderColor: '#f1f5f9',
                verticalAlign: 'middle',
                py: 1.5,
              },
            }}
          >
            <TableHead className="bg-gray-50/80">
              <TableRow>
                <TableCell width="22%" className="font-bold! text-[#64748b]! bg-gray-50!">NAME</TableCell>
                <TableCell width="34%" className="font-bold! text-[#64748b]! bg-gray-50!">DESCRIPTION</TableCell>
                <TableCell width="10%" align="center" className="font-bold! text-[#64748b]! bg-gray-50!">EQUIPMENT</TableCell>
                <TableCell width="18%" className="font-bold! text-[#64748b]! bg-gray-50!">LOCATIONS</TableCell>
                <TableCell width="16%" align="right" className="font-bold! text-[#64748b]! bg-gray-50! pr-6!">ACTIONS</TableCell>
              </TableRow>
            </TableHead>
            <TableBody>
              {environments.map(env => (
                <React.Fragment key={env.id}>
                  <TableRow hover className={expandedEnvId === env.id ? 'bg-green-50/20' : 'bg-white'}>
                    <TableCell>
                      {editingEnvId === env.id ? (
                        <TextField size="small" fullWidth value={editEnvName} onChange={e => setEditEnvName(e.target.value)} />
                      ) : (
                        <Typography className="font-bold! text-gray-900! truncate" title={env.name}>{env.name}</Typography>
                      )}
                    </TableCell>
                    <TableCell>
                      {editingEnvId === env.id ? (
                        <TextField size="small" fullWidth value={editEnvDesc} onChange={e => setEditEnvDesc(e.target.value)} />
                      ) : (
                        <Typography variant="body2" className="text-gray-600 line-clamp-2" title={env.description || ''}>
                          {env.description || '-'}
                        </Typography>
                      )}
                    </TableCell>
                    <TableCell align="center">
                      <span className="inline-flex min-w-9 justify-center rounded-sm border border-gray-200 bg-gray-50 px-2 py-1 text-xs font-bold text-gray-700">
                        {env.equipment_count}
                      </span>
                    </TableCell>
                    <TableCell>
                      <Typography variant="body2" className="text-gray-600">
                        {env.locations?.length || 0} location{(env.locations?.length || 0) === 1 ? '' : 's'}
                      </Typography>
                      {(env.locations || []).length > 0 && (
                        <Typography variant="caption" className="block text-gray-400 mt-1 truncate">
                          {(env.locations || []).slice(0, 4).map(location => location.code).join(', ')}
                          {(env.locations || []).length > 4 ? ` +${env.locations.length - 4} more` : ''}
                        </Typography>
                      )}
                    </TableCell>
                    <TableCell align="right" className="pr-6!">
                      {editingEnvId === env.id ? (
                        <div className="flex gap-2 justify-end">
                          <Button size="small" variant="contained" className="bg-[#00A651]! rounded-none" onClick={() => handleUpdateEnv(env.id)}>Save</Button>
                          <Button size="small" variant="outlined" className="rounded-none" onClick={() => setEditingEnvId(null)}>Cancel</Button>
                        </div>
                      ) : (
                        <div className="flex gap-2 justify-end">
                          <IconButton size="small" onClick={() => { setEditingEnvId(env.id); setEditEnvName(env.name); setEditEnvDesc(env.description || ''); }}>
                            <EditIcon fontSize="small" />
                          </IconButton>
                          <IconButton size="small" className="text-red-500!" onClick={() => handleDeleteEnv(env)}>
                            <DeleteIcon fontSize="small" />
                          </IconButton>
                          <Button
                            size="small"
                            variant={expandedEnvId === env.id ? 'contained' : 'outlined'}
                            endIcon={expandedEnvId === env.id ? <KeyboardArrowDownIcon /> : <KeyboardArrowRightIcon />}
                            onClick={() => setExpandedEnvId(expandedEnvId === env.id ? null : env.id)}
                            className={`${expandedEnvId === env.id ? 'bg-[#00A651]! text-white!' : 'border-gray-300! text-gray-700!'} rounded-none normal-case`}
                          >
                            Locations
                          </Button>
                        </div>
                      )}
                    </TableCell>
                  </TableRow>
                  {expandedEnvId === env.id && (
                    <TableRow>
                      <TableCell colSpan={5} className="bg-gray-50/50! p-0!">
                        <div className="mx-6 my-4 border border-gray-200 bg-white">
                          <div className="px-4 py-3 border-b border-gray-100 flex items-center justify-between gap-4">
                            <Typography variant="subtitle2" className="font-bold! text-gray-800!">Locations for {env.name}</Typography>
                            <Typography variant="caption" className="text-gray-500">{env.locations?.length || 0} configured</Typography>
                          </div>
                          <Table size="small" sx={{ tableLayout: 'fixed' }}>
                            <TableHead>
                              <TableRow>
                                <TableCell width="24%" className="font-bold! text-[#64748b]! bg-gray-50!">LOCATION</TableCell>
                                <TableCell width="56%" className="font-bold! text-[#64748b]! bg-gray-50!">DESCRIPTION</TableCell>
                                <TableCell width="20%" align="right" className="font-bold! text-[#64748b]! bg-gray-50! pr-4!">ACTIONS</TableCell>
                              </TableRow>
                            </TableHead>
                            <TableBody>
                              {(env.locations || []).map(location => (
                                <TableRow key={location.id} hover>
                                  <TableCell>
                                    {editingLocationId === location.id ? (
                                      <TextField size="small" fullWidth value={editLocationCode} onChange={e => setEditLocationCode(e.target.value)} />
                                    ) : (
                                      <span className="font-bold text-gray-800">{location.code}</span>
                                    )}
                                  </TableCell>
                                  <TableCell>
                                    {editingLocationId === location.id ? (
                                      <TextField size="small" fullWidth value={editLocationDesc} onChange={e => setEditLocationDesc(e.target.value)} />
                                    ) : (
                                      <span className="text-sm text-gray-600">{location.description || '-'}</span>
                                    )}
                                  </TableCell>
                                  <TableCell align="right" className="pr-4!">
                                    {editingLocationId === location.id ? (
                                      <div className="flex gap-2 justify-end">
                                        <Button size="small" variant="contained" className="bg-[#00A651]! rounded-none" onClick={() => handleUpdateLocation(location.id)}>Save</Button>
                                        <Button size="small" variant="outlined" className="rounded-none" onClick={() => setEditingLocationId(null)}>Cancel</Button>
                                      </div>
                                    ) : (
                                      <div className="flex gap-1 justify-end">
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
                              {(env.locations || []).length === 0 && (
                                <TableRow>
                                  <TableCell colSpan={3} className="text-gray-500! py-6! text-center!">No locations configured for this environment.</TableCell>
                                </TableRow>
                              )}
                            </TableBody>
                          </Table>
                          <div className="grid grid-cols-1 md:grid-cols-[180px_1fr_auto] gap-3 items-center px-4 py-3 border-t border-gray-100 bg-gray-50/60">
                            <TextField
                              size="small"
                              label="Location Code"
                              value={newLocations[env.id]?.code || ''}
                              onChange={e => updateNewLocation(env.id, 'code', e.target.value)}
                            />
                            <TextField
                              size="small"
                              label="Description"
                              value={newLocations[env.id]?.description || ''}
                              onChange={e => updateNewLocation(env.id, 'description', e.target.value)}
                            />
                            <Button
                              variant="contained"
                              startIcon={<AddIcon />}
                              className="bg-black! text-white! rounded-none normal-case h-10"
                              onClick={() => handleAddLocation(env.id)}
                            >
                              Add Location
                            </Button>
                          </div>
                        </div>
                      </TableCell>
                    </TableRow>
                  )}
                </React.Fragment>
              ))}
            </TableBody>
          </Table>
        </TableContainer>
        <div className="shrink-0 border-t border-gray-100 bg-gray-50/70 px-6 py-4">
          <div className="grid grid-cols-1 md:grid-cols-[240px_1fr_auto] gap-3 items-center">
            <TextField size="small" label="New Environment Name" value={newEnvName} onChange={e => setNewEnvName(e.target.value)} />
            <TextField size="small" label="Description" value={newEnvDesc} onChange={e => setNewEnvDesc(e.target.value)} />
            <Button
              variant="contained"
              startIcon={<AddIcon />}
              className="bg-black! text-white! rounded-none normal-case h-10"
              onClick={handleAddEnv}
            >
              Add Environment
            </Button>
          </div>
        </div>
      </div>
    </div>
  );
};

export default AdminPage;

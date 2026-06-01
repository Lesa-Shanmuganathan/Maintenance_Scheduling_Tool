import React, { useState, useEffect } from 'react';
import { 
  fetchAdminEnvironments, createAdminEnvironment, updateAdminEnvironment, deleteAdminEnvironment
} from '../api';
import { Typography, Paper, Table, TableBody, TableCell, TableContainer, TableHead, TableRow, Button, TextField, IconButton } from '@mui/material';
import EditIcon from '@mui/icons-material/Edit';
import DeleteIcon from '@mui/icons-material/Delete';

const AdminPage = () => {
  const [environments, setEnvironments] = useState([]);
  
  // Environment add/edit states
  const [newEnvName, setNewEnvName] = useState('');
  const [newEnvDesc, setNewEnvDesc] = useState('');
  const [editingEnvId, setEditingEnvId] = useState(null);
  const [editEnvName, setEditEnvName] = useState('');
  const [editEnvDesc, setEditEnvDesc] = useState('');

  const loadEnvironments = async () => {
    try {
      const res = await fetchAdminEnvironments();
      setEnvironments(res.data);
    } catch (err) {
      console.error(err);
    }
  };

  useEffect(() => {
    loadEnvironments();
  }, []);

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

  return (
    <div className="h-full flex flex-col gap-6 overflow-y-auto">
      <div className="bg-white p-6 border border-gray-100 shadow-sm shrink-0">
        <Typography variant="h5" className="text-[#00A651] font-bold mb-4">Manage Environments</Typography>
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
    </div>
  );
};

export default AdminPage;

import React, { useState, useEffect } from 'react';
import { 
  fetchAdminEnvironments, createAdminEnvironment, updateAdminEnvironment, deleteAdminEnvironment, fetchAdminEquipments, deleteEquipment, updateEquipment
} from '../api';
import { Typography, Paper, Table, TableBody, TableCell, TableContainer, TableHead, TableRow, Button, TextField, IconButton } from '@mui/material';
import EditIcon from '@mui/icons-material/Edit';
import DeleteIcon from '@mui/icons-material/Delete';
import EquipmentModal from '../components/EquipmentModal';

const AdminPage = () => {
  const [environments, setEnvironments] = useState([]);
  const [equipments, setEquipments] = useState([]);
  const [search, setSearch] = useState('');
  
  // Environment add/edit states
  const [newEnvName, setNewEnvName] = useState('');
  const [newEnvDesc, setNewEnvDesc] = useState('');
  const [editingEnvId, setEditingEnvId] = useState(null);
  const [editEnvName, setEditEnvName] = useState('');
  const [editEnvDesc, setEditEnvDesc] = useState('');

  // Equipment modal
  const [isModalOpen, setIsModalOpen] = useState(false);
  const [editingEquipment, setEditingEquipment] = useState(null);

  const loadEnvironments = async () => {
    try {
      const res = await fetchAdminEnvironments();
      setEnvironments(res.data);
    } catch (err) {
      console.error(err);
    }
  };

  const loadEquipments = async () => {
    try {
      const res = await fetchAdminEquipments(search);
      setEquipments(res.data);
    } catch (err) {
      console.error(err);
    }
  };

  useEffect(() => {
    loadEnvironments();
    loadEquipments();
  }, [search]);

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
      loadEquipments();
    }
  };

  const handleDeleteEq = async (id) => {
    if (window.confirm("Are you sure you want to delete this equipment?")) {
      await deleteEquipment(id);
      loadEquipments();
      loadEnvironments(); // Update counts
    }
  };

  const handleSaveEq = async (data) => {
    if (editingEquipment) {
      await updateEquipment(editingEquipment.id, data);
    }
    setIsModalOpen(false);
    loadEquipments();
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

      <div className="bg-white p-6 border border-gray-100 shadow-sm flex-1 flex flex-col min-h-0">
        <div className="flex justify-between mb-4">
          <Typography variant="h5" className="text-[#00A651] font-bold">Manage Equipment (Global)</Typography>
          <TextField size="small" placeholder="Search name or serial..." value={search} onChange={e => setSearch(e.target.value)} />
        </div>
        <TableContainer component={Paper} elevation={0} className="flex-1 overflow-y-auto border border-gray-100 rounded-none shadow-sm">
          <Table stickyHeader>
            <TableHead className="bg-gray-50/80">
              <TableRow>
                <TableCell className="font-bold! text-[#64748b]!">SYSTEM NAME</TableCell>
                <TableCell className="font-bold! text-[#64748b]!">SERIAL NR</TableCell>
                <TableCell className="font-bold! text-[#64748b]!">ENVIRONMENT</TableCell>
                <TableCell className="font-bold! text-[#64748b]!">COMMISSIONING</TableCell>
                <TableCell className="font-bold! text-[#64748b]!">FREQUENCY</TableCell>
                <TableCell className="font-bold! text-[#64748b]!">ACTIONS</TableCell>
              </TableRow>
            </TableHead>
            <TableBody>
              {equipments.map(eq => (
                <TableRow key={eq.id} hover>
                  <TableCell>{eq.name}</TableCell>
                  <TableCell>{eq.serial_number || '-'}</TableCell>
                  <TableCell>{eq.environment_name}</TableCell>
                  <TableCell>{eq.commissioning_date}</TableCell>
                  <TableCell>{eq.freq_type}</TableCell>
                  <TableCell>
                    <IconButton size="small" onClick={() => { setEditingEquipment(eq); setIsModalOpen(true); }}>
                      <EditIcon fontSize="small" />
                    </IconButton>
                    <IconButton size="small" className="text-red-500!" onClick={() => handleDeleteEq(eq.id)}>
                      <DeleteIcon fontSize="small" />
                    </IconButton>
                  </TableCell>
                </TableRow>
              ))}
            </TableBody>
          </Table>
        </TableContainer>
      </div>
      
      <EquipmentModal 
        isOpen={isModalOpen}
        onClose={() => setIsModalOpen(false)}
        onSave={handleSaveEq}
        environmentId={editingEquipment?.environment_id}
        initialData={editingEquipment}
      />
    </div>
  );
};

export default AdminPage;

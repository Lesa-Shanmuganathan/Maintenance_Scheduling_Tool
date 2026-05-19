import React, { useState, useEffect, useCallback } from 'react';
import { fetchEnvironments, fetchEquipments, addEquipment, updateEquipment, deleteEquipment, fetchMaintenanceLogs } from '../api';
import EquipmentModal from '../components/EquipmentModal';
import CalendarModal from '../components/CalendarModal';
import ImportDocumentModal from '../components/ImportDocumentModal';
import VerificationTable from '../components/VerificationTable';
import { format } from 'date-fns';
import { 
  Typography, Button, Tabs, Tab, Table, TableBody, TableCell, 
  TableContainer, TableHead, TableRow, Paper, IconButton, Chip, Tooltip,
  Dialog, List, ListItem, Divider
} from '@mui/material';
import AddIcon from '@mui/icons-material/Add';
import EditIcon from '@mui/icons-material/Edit';
import DeleteIcon from '@mui/icons-material/Delete';
import SearchIcon from '@mui/icons-material/Search';
import CalendarMonthIcon from '@mui/icons-material/CalendarMonth';
import DescriptionIcon from '@mui/icons-material/Description';
import { TextField, InputAdornment, TableSortLabel } from '@mui/material';

const MainPage = () => {
  const [environments, setEnvironments] = useState([]);
  const [activeTab, setActiveTab] = useState(0); // Using 0-indexed for MUI Tabs
  const [equipments, setEquipments] = useState([]);
  const [isModalOpen, setIsModalOpen] = useState(false);
  const [editingEquipment, setEditingEquipment] = useState(null);
  const [searchQuery, setSearchQuery] = useState('');
  const [sortOrder, setSortOrder] = useState('asc');
  const [calendarOpen, setCalendarOpen] = useState(false);
  const [calendarEquipment, setCalendarEquipment] = useState(null);
  const [viewType, setViewType] = useState('equipment');
  const [logs, setLogs] = useState([]);
  
  const [isImportModalOpen, setIsImportModalOpen] = useState(false);
  const [verificationSystems, setVerificationSystems] = useState(null);
  
  const [selectedLog, setSelectedLog] = useState(null);

  const handleOpenReport = (event, log) => {
    setSelectedLog(log);
  };

  const handleCloseReport = () => {
    setSelectedLog(null);
  };

  const loadLogs = useCallback(async (envId) => {
    try {
      const res = await fetchMaintenanceLogs(envId);
      setLogs(res.data);
    } catch (err) {
      console.error(err);
    }
  }, []);

  const loadEquipments = useCallback(async (envId) => {
    try {
      const res = await fetchEquipments(envId);
      setEquipments(res.data);
    } catch (err) {
      console.error(err);
    }
  }, []);



  const loadEnvironments = useCallback(async () => {
    try {
      const res = await fetchEnvironments();
      setEnvironments(res.data);
      if (res.data.length > 0) {
        // setActiveTab stays 0, but we need to load equipments for that first env
        loadEquipments(res.data[0].id);
        loadLogs(res.data[0].id);
      }
    } catch (err) {
      console.error(err);
    }
  }, [loadEquipments, loadLogs]);

  useEffect(() => {
    loadEnvironments();
  }, [loadEnvironments]);

  const handleTabChange = (event, newValue) => {
    setActiveTab(newValue);
    if (environments[newValue]) {
      loadEquipments(environments[newValue].id);
      loadLogs(environments[newValue].id);
    }
  };

  const handleSave = async (data) => {
    try {
      if (editingEquipment) {
        await updateEquipment(editingEquipment.id, data);
      } else {
        await addEquipment(data);
      }
      setIsModalOpen(false);
      loadEquipments(environments[activeTab].id);
    } catch (err) {
      console.error(err);
    }
  };

  const handleDelete = async (id) => {
    if (window.confirm("Are you sure you want to delete this equipment?")) {
      await deleteEquipment(id);
      loadEquipments(environments[activeTab].id);
    }
  };

  const formatFrequency = (eq) => {
    if (eq.freq_type !== 'Custom') return eq.freq_type;
    const parts = [];
    if (eq.freq_years) parts.push(`${eq.freq_years}y`);
    if (eq.freq_months) parts.push(`${eq.freq_months}m`);
    if (eq.freq_days) parts.push(`${eq.freq_days}d`);
    return parts.join(', ') || '0 days';
  };

  if (verificationSystems) {
    return (
      <VerificationTable 
        systems={verificationSystems} 
        onComplete={() => {
          setVerificationSystems(null);
          loadEnvironments();
        }}
      />
    );
  }

  return (
    <div className="h-full flex flex-col overflow-hidden space-y-6">
      <div className="shrink-0 bg-white p-6 border border-gray-100 mb-2 shadow-sm">
        <div className="flex flex-col md:flex-row justify-between items-start md:items-center gap-4 mb-6">
          <div className="flex items-center gap-4 flex-1 w-full flex-wrap md:flex-nowrap">
            <Typography variant="h5" className="text-[#00A651] font-bold">
              {viewType === 'equipment' ? 'Equipment Management' : 'Maintenance Logs'}
            </Typography>
              <TextField
              size="small"
              placeholder="Search by system name..."
              value={searchQuery}
              onChange={(e) => setSearchQuery(e.target.value)}
              className="w-full md:max-w-xs ml-0 md:ml-auto"
              slotProps={{
                input: {
                  className: 'rounded-none bg-white',
                  startAdornment: (
                    <InputAdornment position="start">
                      <SearchIcon fontSize="small" />
                    </InputAdornment>
                  ),
                }
              }}
            />
          </div>
          {viewType === 'equipment' && (
            <div className="flex gap-2">
              <Button 
                variant="outlined" 
                onClick={() => setIsImportModalOpen(true)}
                className="border-gray-300! text-gray-700! font-bold py-3 px-6 transition-all hover:bg-gray-50! rounded-none shadow-sm shrink-0 normal-case"
              >
                + Import from Document
              </Button>
              <Button 
                variant="contained" 
                startIcon={<AddIcon />} 
                onClick={() => {
                  setEditingEquipment(null);
                  setIsModalOpen(true);
                }}
                className="bg-black! text-white! font-bold py-3 px-6 transition-all hover:bg-gray-800! rounded-none shadow-md shrink-0 normal-case"
              >
                Add Equipment
              </Button>
            </div>
          )}
        </div>

        {environments.length > 0 && (
          <div className="flex flex-col sm:flex-row justify-between items-start sm:items-center border-t border-gray-100 pr-0 sm:pr-6 gap-4 sm:gap-0 bg-gray-50/30">
            <Tabs 
              value={activeTab} 
              onChange={handleTabChange} 
              className="bg-transparent"
              TabIndicatorProps={{ className: 'bg-[#00A651]! h-[3px]!' }}
            >
              {environments.map((env) => (
                <Tab 
                  key={env.id} 
                  label={env.name} 
                  className="py-5 text-[14px] font-bold tracking-wide transition-all data-[selected=true]:text-[#00A651]! hover:text-gray-900 rounded-none px-6" 
                />
              ))}
            </Tabs>
            
            <div className="flex bg-gray-200/60 p-1 rounded-none border border-gray-300/50 mb-4 sm:mb-0 ml-6 sm:ml-0">
              <button 
                onClick={() => setViewType('equipment')}
                className={`px-6 py-1.5 text-[13px] font-bold transition-all uppercase tracking-wider ${viewType === 'equipment' ? 'bg-white text-[#00A651] shadow-sm border border-gray-200/50' : 'text-gray-500 hover:text-gray-900 border border-transparent'}`}
              >
                Equipments
              </button>
              <button 
                onClick={() => setViewType('logs')}
                className={`px-6 py-1.5 text-[13px] font-bold transition-all uppercase tracking-wider ${viewType === 'logs' ? 'bg-white text-[#00A651] shadow-sm border border-gray-200/50' : 'text-gray-500 hover:text-gray-900 border border-transparent'}`}
              >
                Logs
              </button>
            </div>
          </div>
        )}
      </div>

      <TableContainer component={Paper} elevation={0} className="flex-1 overflow-y-auto border border-gray-100 rounded-none shadow-sm">
        {viewType === 'equipment' ? (
        <Table stickyHeader>
          <TableHead className="bg-gray-50/80">
            <TableRow>
              <TableCell className="font-bold! text-[#64748b]! tracking-wider! py-4! bg-gray-50/90!">SYSTEM NAME</TableCell>
              <TableCell className="font-bold! text-[#64748b]! tracking-wider! py-4! bg-gray-50/90!">DESCRIPTION</TableCell>
              <TableCell className="font-bold! text-[#64748b]! tracking-wider! py-4! bg-gray-50/90!">COMMISSIONING</TableCell>
              <TableCell className="font-bold! text-[#64748b]! tracking-wider! py-4! bg-gray-50/90!">FREQUENCY</TableCell>
              <TableCell className="font-bold! text-[#64748b]! tracking-wider! py-4! bg-gray-50/90!">
                <TableSortLabel
                  active={true}
                  direction={sortOrder}
                  onClick={() => setSortOrder(prev => prev === 'asc' ? 'desc' : 'asc')}
                >
                  NEXT DUEDATE
                </TableSortLabel>
              </TableCell>
              <TableCell className="font-bold! text-[#64748b]! tracking-wider! py-4! text-center! bg-gray-50/90!">ACTIONS</TableCell>
            </TableRow>
          </TableHead>
          <TableBody>
            {equipments
              .filter(eq => eq.name.toLowerCase().includes(searchQuery.toLowerCase()))
              .sort((a, b) => {
                const dA = new Date(a.next_maintenance_date).getTime();
                const dB = new Date(b.next_maintenance_date).getTime();
                return sortOrder === 'asc' ? dA - dB : dB - dA;
              })
              .map((eq) => (
              <TableRow key={eq.id} hover className="transition-all hover:bg-gray-50/50">
                <TableCell className="font-bold! text-gray-900!">{eq.name}</TableCell>
                <TableCell className="text-gray-500! text-[13px]! max-w-[250px] truncate">
                  <Tooltip title={eq.description || ''} arrow placement="top">
                    <span>{eq.description || '-'}</span>
                  </Tooltip>
                </TableCell>
                <TableCell className="text-gray-700!">{format(new Date(eq.commissioning_date), 'MMM dd, yyyy')}</TableCell>
                <TableCell className="font-semibold! text-gray-800!">{formatFrequency(eq)}</TableCell>
                <TableCell>
                  <Chip 
                    label={format(new Date(eq.next_maintenance_date), 'MMM dd, yyyy')} 
                    size="small"
                    className="bg-amber-50! text-amber-700! font-bold! text-[11px]! border! border-amber-100! rounded-none py-1"
                  />
                </TableCell>
                <TableCell align="center">
                  <div className="flex justify-center gap-3">
                    <Tooltip title="View Calendar">
                      <IconButton 
                        size="small" 
                        onClick={() => {
                          setCalendarEquipment(eq);
                          setCalendarOpen(true);
                        }}
                        className="text-blue-600! bg-blue-50! hover:bg-blue-100! transition-all rounded-none"
                      >
                        <CalendarMonthIcon fontSize="small" />
                      </IconButton>
                    </Tooltip>
                    <IconButton 
                      size="small" 
                      onClick={() => {
                        setEditingEquipment(eq);
                        setIsModalOpen(true);
                      }}
                      className="text-[#00A651]! bg-[#00A6510a]! hover:bg-[#00A6511a]! transition-all rounded-none"
                    >
                      <EditIcon fontSize="small" />
                    </IconButton>
                    <IconButton 
                      size="small" 
                      onClick={() => handleDelete(eq.id)}
                      className="text-red-500! bg-red-50! hover:bg-red-100! transition-all rounded-none"
                    >
                      <DeleteIcon fontSize="small" />
                    </IconButton>
                  </div>
                </TableCell>
              </TableRow>
            ))}
            {equipments.length === 0 && (
              <TableRow>
                <TableCell colSpan={6} align="center" className="py-20">
                  <Typography className="text-gray-400! italic font-medium">No equipment found. Create your first record above.</Typography>
                </TableCell>
              </TableRow>
            )}
          </TableBody>
        </Table>
        ) : (
        <Table stickyHeader>
          <TableHead className="bg-gray-50/80">
            <TableRow>
              <TableCell className="font-bold! text-[#64748b]! tracking-wider! py-4! bg-gray-50/90!">COMPLETION DATE</TableCell>
              <TableCell className="font-bold! text-[#64748b]! tracking-wider! py-4! bg-gray-50/90!">SYSTEM NAME</TableCell>
              <TableCell className="font-bold! text-[#64748b]! tracking-wider! py-4! bg-gray-50/90!">PERFORMED BY</TableCell>
              <TableCell className="font-bold! text-[#64748b]! tracking-wider! py-4! bg-gray-50/90!">DESCRIPTION</TableCell>
              <TableCell className="font-bold! text-[#64748b]! tracking-wider! py-4! bg-gray-50/90!">DOCUMENT</TableCell>
            </TableRow>
          </TableHead>
          <TableBody>
            {logs
              .filter(log => log.equipment_name.toLowerCase().includes(searchQuery.toLowerCase()))
              .map((log) => (
              <TableRow key={log.id} hover className="transition-all hover:bg-gray-50/50">
                <TableCell className="text-gray-700! font-semibold!">
                  {format(new Date(log.completion_date), 'MMM dd, yyyy')}
                </TableCell>
                <TableCell className="font-bold! text-gray-900!">{log.equipment_name}</TableCell>
                <TableCell className="text-gray-700!">{log.person || '-'}</TableCell>
                <TableCell className="text-gray-500! text-[13px]! max-w-[250px] truncate">
                  <Tooltip title={log.description || ''} arrow placement="top">
                    <span>{log.description || '-'}</span>
                  </Tooltip>
                </TableCell>
                <TableCell>
                  {log.document_paths && log.document_paths.length > 0 ? (
                    <Button
                      variant="text"
                      size="small"
                      startIcon={<DescriptionIcon />}
                      onClick={(e) => handleOpenReport(e, log)}
                      className="text-blue-600! normal-case! font-semibold!"
                    >
                      View Report
                    </Button>
                  ) : (
                    <span className="text-gray-400 text-sm">No doc</span>
                  )}
                </TableCell>
              </TableRow>
            ))}
            {logs.length === 0 && (
              <TableRow>
                <TableCell colSpan={5} align="center" className="py-20">
                  <Typography className="text-gray-400! italic font-medium">No maintenance logs found for this environment.</Typography>
                </TableCell>
              </TableRow>
            )}
            {logs.length > 0 && logs.filter(log => log.equipment_name.toLowerCase().includes(searchQuery.toLowerCase())).length === 0 && (
              <TableRow>
                <TableCell colSpan={5} align="center" className="py-20">
                  <Typography className="text-gray-400! italic font-medium">No logs match your search.</Typography>
                </TableCell>
              </TableRow>
            )}
          </TableBody>
        </Table>
        )}
      </TableContainer>

      <ImportDocumentModal 
        isOpen={isImportModalOpen}
        onClose={() => setIsImportModalOpen(false)}
        onSuccess={(data) => {
          setIsImportModalOpen(false);
          setVerificationSystems(data);
        }}
      />

      <EquipmentModal 
        isOpen={isModalOpen}
        onClose={() => setIsModalOpen(false)}
        onSave={handleSave}
        environmentId={environments[activeTab]?.id}
        initialData={editingEquipment}
      />
      {calendarOpen && (
        <CalendarModal
          isOpen={calendarOpen}
          onClose={() => setCalendarOpen(false)}
          equipmentId={calendarEquipment?.id}
          equipmentName={calendarEquipment?.name}
        />
      )}

      <Dialog
        open={Boolean(selectedLog)}
        onClose={handleCloseReport}
        maxWidth="sm"
        fullWidth
        PaperProps={{
          className: 'p-8 rounded-none shadow-2xl border border-gray-100'
        }}
      >
        {selectedLog && (
          <div className="flex flex-col gap-6">
            <Typography variant="h5" className="font-bold text-[#00A651] border-b border-gray-100 pb-3">
              Maintenance Report Details
            </Typography>
            
            <div className="flex flex-col gap-5">
              <div className="grid grid-cols-1 sm:grid-cols-2 gap-y-5 gap-x-6 text-[15px]">
                <div className="flex flex-col">
                  <span className="text-gray-500 font-semibold uppercase tracking-wider text-[11px] mb-1">System Name</span>
                  <span className="text-gray-900 font-bold text-lg">{selectedLog.equipment_name}</span>
                </div>
                
                <div className="flex flex-col">
                  <span className="text-gray-500 font-semibold uppercase tracking-wider text-[11px] mb-1">Completion Date</span>
                  <span className="text-gray-900 font-bold text-lg">{format(new Date(selectedLog.completion_date), 'MMMM dd, yyyy')}</span>
                </div>
                
                <div className="flex flex-col sm:col-span-2">
                  <span className="text-gray-500 font-semibold uppercase tracking-wider text-[11px] mb-1">Performed By</span>
                  <span className="text-gray-900 font-medium text-[16px]">{selectedLog.person || '-'}</span>
                </div>
                
                <div className="flex flex-col sm:col-span-2">
                  <span className="text-gray-500 font-semibold uppercase tracking-wider text-[11px] mb-1">Description & Notes</span>
                  <div className="text-gray-800 bg-gray-50/50 p-4 border border-gray-100 mt-1 min-h-[80px] text-[15px] leading-relaxed">
                    {selectedLog.description || '-'}
                  </div>
                </div>
              </div>
            </div>
            
            {selectedLog.document_paths && selectedLog.document_paths.length > 0 && (
              <div className="mt-2">
                <Typography variant="subtitle1" className="font-bold text-gray-800 mb-3 border-b border-gray-100 pb-2">
                  Attached Documents ({selectedLog.document_paths.length})
                </Typography>
                <div className="flex flex-col gap-2">
                  {selectedLog.document_paths.map((docPath, index) => {
                    const filename = docPath.split(/[\\/]/).pop().replace(/^\d+_\d+_/, '');
                    return (
                      <Button 
                        key={index}
                        href={`http://127.0.0.1:5000/${docPath.replace(/\\/g, '/')}`}
                        target="_blank"
                        download
                        variant="outlined"
                        startIcon={<DescriptionIcon />}
                        className="text-blue-700! border-blue-200! bg-blue-50/30! normal-case! justify-start text-left w-full hover:bg-blue-50! rounded-none py-2.5 px-4 shadow-sm transition-all"
                      >
                        <span className="truncate w-full font-semibold">{filename || `Document ${index + 1}`}</span>
                      </Button>
                    );
                  })}
                </div>
              </div>
            )}
            
            <div className="mt-4 flex justify-end border-t border-gray-100 pt-5">
              <Button 
                onClick={handleCloseReport} 
                variant="contained" 
                className="bg-gray-800! hover:bg-black! text-white! rounded-none px-8 py-2 font-bold shadow-none normal-case transition-colors"
              >
                Close Report
              </Button>
            </div>
          </div>
        )}
      </Dialog>
    </div>
  );
};

export default MainPage;

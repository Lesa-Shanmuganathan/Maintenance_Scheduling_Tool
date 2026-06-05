import React, { useState, useEffect, useCallback } from 'react';
import { fetchEnvironments, fetchEquipments, addEquipment, updateEquipment, deleteEquipment, toggleStandby, setCalendarOverride } from '../api';
import EquipmentModal from '../components/EquipmentModal';
import ImportDocumentModal from '../components/ImportDocumentModal';
import VerificationTable from '../components/VerificationTable';
import InlineCalendar from '../components/InlineCalendar';
import PendingReviewPage from './PendingReviewPage';
import { format } from 'date-fns';
import { 
  Typography, Button, Tabs, Tab, Table, TableBody, TableCell, 
  TableContainer, TableHead, TableRow, IconButton, Chip, Tooltip,
  Dialog, TextField, TableSortLabel, Popover, Badge,
  FormControl, InputLabel, Select, MenuItem
} from '@mui/material';
import AddIcon from '@mui/icons-material/Add';
import EditIcon from '@mui/icons-material/Edit';
import DeleteIcon from '@mui/icons-material/Delete';
import ArrowDropUpIcon from '@mui/icons-material/ArrowDropUp';
import EventRepeatIcon from '@mui/icons-material/EventRepeat';

const MainPage = ({ pendingCount }) => {
  const [environments, setEnvironments] = useState([]);
  const [activeTab, setActiveTab] = useState(0); 
  const [equipments, setEquipments] = useState([]);
  const [isModalOpen, setIsModalOpen] = useState(false);
  const [editingEquipment, setEditingEquipment] = useState(null);
  const [searchQuery, setSearchQuery] = useState('');
  const [sortField, setSortField] = useState('name');
  const [sortOrder, setSortOrder] = useState('asc');
  
  const [environmentFilter, setEnvironmentFilter] = useState('All');
  const [locationFilter, setLocationFilter] = useState('All');
  const [frequencyFilter, setFrequencyFilter] = useState('All');

  const [isImportModalOpen, setIsImportModalOpen] = useState(false);
  const [verificationSystems, setVerificationSystems] = useState(null);
  
  const [selectedLog, setSelectedLog] = useState(null);
  const [popoverAnchor, setPopoverAnchor] = useState(null);
  const [overrideDate, setOverrideDate] = useState('');
  const [overrideEq, setOverrideEq] = useState(null);
  const [calendarRefreshKey, setCalendarRefreshKey] = useState(0);

  const handleOpenReport = (event, log) => setSelectedLog(log);
  const handleCloseReport = () => setSelectedLog(null);

  const loadEquipments = useCallback(async () => {
    try {
      const res = await fetchEquipments();
      setEquipments(res.data);
    } catch (err) {
      console.error(err);
    }
  }, []);

  const loadEnvironments = useCallback(async () => {
    try {
      const res = await fetchEnvironments();
      setEnvironments(res.data);
      loadEquipments();
    } catch (err) {
      console.error(err);
    }
  }, [loadEquipments]);

  useEffect(() => {
    loadEnvironments();
  }, [loadEnvironments]);

  const handleTabChange = (event, newValue) => {
    setActiveTab(newValue);
    if (newValue === 0) {
      loadEquipments();
      setEnvironmentFilter('All');
      setLocationFilter('All');
      setFrequencyFilter('All');
    }
  };

  const handleSort = (field) => {
    setSortField(field);
    setSortOrder(prev => sortField === field && prev === 'asc' ? 'desc' : 'asc');
  };

  const handleSave = async (data) => {
    try {
      if (editingEquipment) {
        await updateEquipment(editingEquipment.id, data);
      } else {
        await addEquipment(data);
      }
      setIsModalOpen(false);
      await loadEquipments();
      setCalendarRefreshKey(prev => prev + 1);
    } catch (err) {
      console.error(err);
    }
  };

  const handleDelete = async (id) => {
    if (window.confirm("Are you sure you want to delete this equipment?")) {
      await deleteEquipment(id);
      await loadEquipments();
      setCalendarRefreshKey(prev => prev + 1);
    }
  };

  const handleToggleStandby = async (eq) => {
    const newStandby = eq.standby === 1 ? false : true;
    await toggleStandby(eq.id, newStandby);
    await loadEquipments();
    setCalendarRefreshKey(prev => prev + 1);
  };

  const openOverridePopover = (event, eq) => {
    setPopoverAnchor(event.currentTarget);
    setOverrideEq(eq);
    setOverrideDate(eq.next_maintenance_date.split('T')[0]);
  };

  const saveOverride = async () => {
    if (overrideEq && overrideDate) {
      await setCalendarOverride(overrideEq.id, overrideEq.next_maintenance_date.split('T')[0], overrideDate);
      await loadEquipments();
      setCalendarRefreshKey(prev => prev + 1);
      setPopoverAnchor(null);
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

  const renderDueDate = (eq) => {
    if (eq.standby === 1) {
      return <span className="text-gray-400 font-bold">On Standby</span>;
    }
    const due = new Date(eq.next_maintenance_date);
    const today = new Date();
    const isOverdue = due < today;
    const diffDays = Math.ceil((due - today) / (1000 * 60 * 60 * 24));
    
    let colorClass = 'text-[#00A651] font-bold';
    if (isOverdue) colorClass = 'text-[#C0392B] font-bold';
    else if (diffDays <= 7) colorClass = 'text-[#E67E22] font-bold';
    else if (diffDays <= 30) colorClass = 'text-blue-600 font-bold';

    return <span className={colorClass}>{format(due, 'dd MMM yyyy')}</span>;
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

  const isPendingTab = activeTab === 1;
  const activeEnvironment = environmentFilter === 'All' ? null : environments.find(env => env.name === environmentFilter);
  const activeEnvironmentId = activeEnvironment?.id || '';
  const locationOptions = activeEnvironment
    ? activeEnvironment.locations || []
    : environments.flatMap(env => env.locations || []);
  const filteredEquipments = equipments
    .filter(eq => environmentFilter === 'All' || eq.environment_name === environmentFilter)
    .filter(eq => locationFilter === 'All' || (eq.location || '') === locationFilter)
    .filter(eq => frequencyFilter === 'All' || eq.freq_type === frequencyFilter)
    .filter(eq => eq.name && eq.name.toLowerCase().includes(searchQuery.toLowerCase()));
  const frequencyOptions = ['Daily', 'Weekly', 'Monthly', 'Half Yearly', 'Yearly', 'Custom'];
  const sortLabelSx = {
    '& .MuiTableSortLabel-icon': {
      opacity: 1,
      color: '#64748b !important'
    }
  };

  return (
    <div className="h-full flex overflow-hidden">
      <div className={`${isPendingTab ? 'flex-1' : 'flex-[6.5]'} flex flex-col h-full bg-white border-r border-gray-200 relative z-10 shadow-[4px_0_12px_rgba(0,0,0,0.03)]`}>
        <div className="shrink-0 pt-4 px-6 border-b border-gray-100 flex flex-col gap-4">
          <Tabs 
            value={activeTab} 
            onChange={handleTabChange} 
            className="bg-transparent -mb-[1px]"
            TabIndicatorProps={{ className: 'bg-[#00A651]! h-[3px]!' }}
          >
            <Tab 
              label="Equipments"
              className="py-4 text-[14px] font-bold tracking-wide transition-all data-[selected=true]:text-[#00A651]! hover:text-gray-900 rounded-none px-6" 
            />
            <Tab 
              label={
                <Badge badgeContent={pendingCount} color="error" sx={{ '& .MuiBadge-badge': { backgroundColor: '#C0392B' } }}>
                  <span>Pending Review</span>
                </Badge>
              }
              className="py-4 text-[14px] font-bold tracking-wide transition-all data-[selected=true]:text-[#00A651]! hover:text-gray-900 rounded-none px-8" 
            />
          </Tabs>

          {!isPendingTab && (
            <div className="flex flex-col gap-4 pb-4">
              <div className="flex flex-wrap items-center justify-between gap-4">
                <div className="flex flex-wrap items-center gap-3">
                  <FormControl size="small" className="min-w-[160px]">
                    <InputLabel id="equipment-location-filter-label">Location</InputLabel>
                    <Select
                      labelId="equipment-location-filter-label"
                      value={locationFilter}
                      label="Location"
                      onChange={(event) => setLocationFilter(event.target.value)}
                      className="rounded-none bg-white"
                    >
                      <MenuItem value="All">All Locations</MenuItem>
                      {locationOptions.map(loc => (
                        <MenuItem key={`${loc.id}-${loc.code}`} value={loc.code}>{loc.code}</MenuItem>
                      ))}
                    </Select>
                  </FormControl>
                  <FormControl size="small" className="min-w-[160px]">
                    <InputLabel id="equipment-frequency-filter-label">Frequency</InputLabel>
                    <Select
                      labelId="equipment-frequency-filter-label"
                      value={frequencyFilter}
                      label="Frequency"
                      onChange={(event) => setFrequencyFilter(event.target.value)}
                      className="rounded-none bg-white"
                    >
                      <MenuItem value="All">All Frequencies</MenuItem>
                      {frequencyOptions.map(freq => (
                        <MenuItem key={freq} value={freq}>{freq === 'Custom' ? 'Custom Interval' : freq}</MenuItem>
                      ))}
                    </Select>
                  </FormControl>
                </div>
                <div className="flex gap-2">
                  <Button 
                    variant="outlined" 
                    onClick={() => setIsImportModalOpen(true)}
                    className="border-gray-300! text-gray-700! font-bold py-2 px-4 transition-all hover:bg-gray-50! rounded-none shadow-sm normal-case text-sm"
                  >
                    Import from Document
                  </Button>
                  <Button 
                    variant="contained" 
                    startIcon={<AddIcon />} 
                    onClick={() => {
                      setEditingEquipment(null);
                      setIsModalOpen(true);
                    }}
                    className="bg-black! text-white! font-bold py-2 px-4 transition-all hover:bg-gray-800! rounded-none shadow-sm normal-case text-sm"
                  >
                    Add Equipment
                  </Button>
                </div>
              </div>

              {environments.length > 0 && (
                <div className="flex items-center gap-2 overflow-x-auto pb-1 mt-1">
                  <Typography variant="caption" className="font-bold text-gray-500 mr-2 uppercase tracking-wide">Environments:</Typography>
                  <Chip 
                    label="All" 
                    size="small"
                    onClick={() => { setEnvironmentFilter('All'); setLocationFilter('All'); }} 
                    className={`rounded-sm font-bold cursor-pointer transition-all ${environmentFilter === 'All' ? 'bg-[#00A651]! text-white! shadow-sm' : 'bg-gray-100! text-gray-700! hover:bg-gray-200!'}`}
                  />
                  {environments.map(env => (
                    <Chip 
                      key={env.id}
                      label={env.name} 
                      size="small"
                      onClick={() => { setEnvironmentFilter(env.name); setLocationFilter('All'); }} 
                      className={`rounded-sm font-bold cursor-pointer transition-all ${environmentFilter === env.name ? 'bg-[#00A651]! text-white! shadow-sm' : 'bg-gray-100! text-gray-700! hover:bg-gray-200!'}`}
                    />
                  ))}
                </div>
              )}
            </div>
          )}
        </div>

        {isPendingTab ? (
          <div className="flex-1 overflow-y-auto">
            <PendingReviewPage onCountChange={() => {}} hideWrapper />
          </div>
        ) : (
            <TableContainer className="flex-1 overflow-y-auto overflow-x-auto">
              <Table stickyHeader size="small" sx={{ tableLayout: 'auto' }}>
                <TableHead>
                  <TableRow className="bg-gray-50 border-b border-gray-200">
                    <TableCell className="font-bold! text-gray-600! whitespace-nowrap">
                      <TableSortLabel
                        active={sortField === 'name'}
                        direction={sortField === 'name' ? sortOrder : 'asc'}
                        onClick={() => handleSort('name')}
                        IconComponent={ArrowDropUpIcon}
                        sx={sortLabelSx}
                      >
                        SYSTEM NAME
                      </TableSortLabel>
                    </TableCell>
                    <TableCell className="font-bold! text-gray-600! whitespace-nowrap">
                      <TableSortLabel
                        active={sortField === 'serial'}
                        direction={sortField === 'serial' ? sortOrder : 'asc'}
                        onClick={() => handleSort('serial')}
                        IconComponent={ArrowDropUpIcon}
                        sx={sortLabelSx}
                      >
                        SERIAL NR
                      </TableSortLabel>
                    </TableCell>
                    <TableCell className="font-bold! text-gray-600! whitespace-nowrap">LOCATION</TableCell>
                    <TableCell className="font-bold! text-gray-600! whitespace-nowrap">DESCRIPTION</TableCell>
                    <TableCell className="font-bold! text-gray-600! whitespace-nowrap">COMMISSIONING</TableCell>
                    <TableCell className="font-bold! text-gray-600! whitespace-nowrap">FREQUENCY</TableCell>
                    <TableCell className="font-bold! text-gray-600! whitespace-nowrap">
                      <TableSortLabel
                        active={sortField === 'next_due'}
                        direction={sortField === 'next_due' ? sortOrder : 'asc'}
                        onClick={() => handleSort('next_due')}
                        IconComponent={ArrowDropUpIcon}
                        sx={sortLabelSx}
                      >
                        NEXT DUE DATE
                      </TableSortLabel>
                    </TableCell>
                    <TableCell className="font-bold! text-gray-600! text-center whitespace-nowrap">ACTIONS</TableCell>
                  </TableRow>
                </TableHead>
                <TableBody>
                  {filteredEquipments
                    .sort((a, b) => {
                      let valA = '', valB = '';
                      if (sortField === 'name') { valA = a.name?.toLowerCase() || ''; valB = b.name?.toLowerCase() || ''; }
                      else if (sortField === 'serial') { valA = a.serial_number?.toLowerCase() || ''; valB = b.serial_number?.toLowerCase() || ''; }
                      else if (sortField === 'location') { valA = a.location?.toLowerCase() || ''; valB = b.location?.toLowerCase() || ''; }
                      else if (sortField === 'next_due') { valA = new Date(a.next_maintenance_date || 0).getTime(); valB = new Date(b.next_maintenance_date || 0).getTime(); }
                      
                      if (valA < valB) return sortOrder === 'asc' ? -1 : 1;
                      if (valA > valB) return sortOrder === 'asc' ? 1 : -1;
                      return 0;
                    })
                    .map((eq) => (
                    <TableRow key={eq.id} hover>
                      <TableCell className="font-bold! text-gray-900!">{eq.name || '-'}</TableCell>
                      <TableCell>{eq.serial_number || '-'}</TableCell>
                      <TableCell>{eq.location || '-'}</TableCell>
                      <TableCell sx={{ maxWidth: 320 }} className="text-gray-500! text-xs! whitespace-normal break-words leading-5 py-3!">
                        {eq.description || '-'}
                      </TableCell>
                      <TableCell className="text-gray-700!">{format(new Date(eq.commissioning_date), 'dd MMM yyyy')}</TableCell>
                      <TableCell className="font-semibold! text-gray-800!">{formatFrequency(eq)}</TableCell>
                      <TableCell>{renderDueDate(eq)}</TableCell>
                      <TableCell align="center" className="whitespace-nowrap">
                        <div className="flex justify-center gap-1">
                          <Tooltip title="Reschedule">
                            <IconButton size="small" onClick={(e) => openOverridePopover(e, eq)} className="text-blue-600!">
                              <EventRepeatIcon fontSize="small" />
                            </IconButton>
                          </Tooltip>
                          <Tooltip title="Edit">
                            <IconButton size="small" onClick={() => { setEditingEquipment(eq); setIsModalOpen(true); }} className="text-[#00A651]!">
                              <EditIcon fontSize="small" />
                            </IconButton>
                          </Tooltip>
                          <Tooltip title="Delete">
                            <IconButton size="small" onClick={() => handleDelete(eq.id)} className="text-red-500!">
                              <DeleteIcon fontSize="small" />
                            </IconButton>
                          </Tooltip>
                          <Tooltip title={eq.standby === 1 ? "On Standby — click to reactivate" : "Set to Standby"}>
                            <IconButton size="small" onClick={() => handleToggleStandby(eq)} className="p-1.5 ml-1">
                              {eq.standby === 1 ? (
                                <div className="w-[18px] h-[18px] rounded-full border-[2.5px] border-[#C0392B] flex items-center justify-center">
                                  <div className="w-[7px] h-[7px] bg-[#C0392B]"></div>
                                </div>
                              ) : (
                                <div className="w-[18px] h-[18px] rounded-full border-[2.5px] border-gray-400"></div>
                              )}
                            </IconButton>
                          </Tooltip>
                        </div>
                      </TableCell>
                    </TableRow>
                  ))}
                  {filteredEquipments.length === 0 && (
                    <TableRow><TableCell colSpan={8} align="center" className="py-20 text-gray-400">No equipment found.</TableCell></TableRow>
                  )}
                </TableBody>
              </Table>
          </TableContainer>
        )}
      </div>

      {!isPendingTab && (
        <div className="flex-[3.5] h-full overflow-hidden bg-[#FAFAFA]">
          <InlineCalendar
            environmentId={activeEnvironmentId}
            refreshKey={calendarRefreshKey}
          />
        </div>
      )}

      <ImportDocumentModal 
        isOpen={isImportModalOpen}
        onClose={() => setIsImportModalOpen(false)}
        onSuccess={(data) => { setIsImportModalOpen(false); setVerificationSystems(data); }}
      />
      <EquipmentModal 
        isOpen={isModalOpen}
        onClose={() => setIsModalOpen(false)}
        onSave={handleSave}
        environments={environments}
        environmentId={activeEnvironmentId || null}
        initialData={editingEquipment}
      />
      <Popover
        open={Boolean(popoverAnchor)}
        anchorEl={popoverAnchor}
        onClose={() => setPopoverAnchor(null)}
        anchorOrigin={{ vertical: 'bottom', horizontal: 'center' }}
        transformOrigin={{ vertical: 'top', horizontal: 'center' }}
      >
        <div className="p-4 flex flex-col gap-3 min-w-[250px]">
          <Typography variant="subtitle2" className="font-bold">Reschedule Task</Typography>
          <TextField 
            type="date" 
            size="small" 
            value={overrideDate} 
            onChange={e => setOverrideDate(e.target.value)} 
          />
          <div className="flex gap-2 justify-end mt-2">
            <Button size="small" onClick={() => setPopoverAnchor(null)}>Cancel</Button>
            <Button size="small" variant="contained" className="bg-[#00A651]! rounded-none" onClick={saveOverride}>Save</Button>
          </div>
        </div>
      </Popover>

      {/* Log Modal omitted for brevity, but let's just make it simple */}
      <Dialog open={Boolean(selectedLog)} onClose={handleCloseReport} maxWidth="sm" fullWidth>
        {selectedLog && (
          <div className="p-6 flex flex-col gap-4">
            <Typography variant="h6" className="font-bold text-[#00A651]">Report Details</Typography>
            <Typography><b>System:</b> {selectedLog.equipment_name}</Typography>
            <Typography><b>Completed:</b> {format(new Date(selectedLog.completion_date), 'dd MMM yyyy')}</Typography>
            <Typography><b>Description:</b> {selectedLog.description}</Typography>
            {selectedLog.document_paths && selectedLog.document_paths.map((p, i) => (
              <Button key={i} href={`http://127.0.0.1:5000/${p.replace(/\\/g, '/')}`} target="_blank" variant="outlined" download className="rounded-none">
                Download Document
              </Button>
            ))}
          </div>
        )}
      </Dialog>
    </div>
  );
};

export default MainPage;

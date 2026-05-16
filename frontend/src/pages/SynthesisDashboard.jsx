import React, { useState, useEffect, useCallback } from 'react';
import { fetchSynthesis, fetchEnvironments, completeMaintenance } from '../api';
import { format } from 'date-fns';
import { 
  Typography, Button, FormControl, InputLabel, Select, MenuItem, 
  Table, TableBody, TableCell, TableContainer, TableHead, TableRow, 
  Paper, Chip, TextField, InputAdornment, TableSortLabel, IconButton, Tooltip,
  Dialog, DialogTitle, DialogContent, DialogActions
} from '@mui/material';
import FilterAltOffIcon from '@mui/icons-material/FilterAltOff';
import CheckCircleOutlineIcon from '@mui/icons-material/CheckCircleOutline';
import TodayIcon from '@mui/icons-material/Today';
import SearchIcon from '@mui/icons-material/Search';
import WarningAmberIcon from '@mui/icons-material/WarningAmber';
const SynthesisDashboard = () => {
  const currentDate = new Date();
  const defaultMonth = currentDate.getMonth() + 1;
  const defaultYear = currentDate.getFullYear();

  const [month, setMonth] = useState(defaultMonth);
  const [year, setYear] = useState(defaultYear);
  const [environments, setEnvironments] = useState([]);
  const [selectedEnv, setSelectedEnv] = useState('all');
  const [isTodayFilter, setIsTodayFilter] = useState(false);
  const [isOverdueFilter, setIsOverdueFilter] = useState(false);
  const [tasks, setTasks] = useState([]);
  const [completedTaskIds, setCompletedTaskIds] = useState(new Set());
  const [searchQuery, setSearchQuery] = useState('');
  const [sortOrder, setSortOrder] = useState('asc');
  
  const [isCompleteModalOpen, setIsCompleteModalOpen] = useState(false);
  const [completingTask, setCompletingTask] = useState(null);
  const [completeFormData, setCompleteFormData] = useState({
    completion_date: format(new Date(), 'yyyy-MM-dd'),
    person: '',
    description: '',
    documents: []
  });

  const loadEnvironments = useCallback(async () => {
    try {
      const res = await fetchEnvironments();
      setEnvironments(res.data);
    } catch (err) {
      console.error(err);
    }
  }, []);

  const loadSynthesis = useCallback(async () => {
    try {
      const res = await fetchSynthesis(month, year, selectedEnv, isTodayFilter, isOverdueFilter);
      setTasks(res.data);
      setCompletedTaskIds(new Set());
    } catch (err) {
      console.error(err);
    }
  }, [month, year, selectedEnv, isTodayFilter, isOverdueFilter]);

  useEffect(() => {
    loadEnvironments();
  }, [loadEnvironments]);

  useEffect(() => {
    loadSynthesis();
  }, [loadSynthesis]);

  const handleOpenCompleteModal = (task) => {
    setCompletingTask(task);
    setCompleteFormData({
      completion_date: format(new Date(), 'yyyy-MM-dd'),
      person: '',
      description: '',
      documents: []
    });
    setIsCompleteModalOpen(false);
    setTimeout(() => setIsCompleteModalOpen(true), 10);
  };

  const handleCompleteMaintenanceSubmit = async () => {
    if (!completingTask) return;
    try {
      const formData = new FormData();
      formData.append('completion_date', completeFormData.completion_date);
      formData.append('person', completeFormData.person);
      formData.append('description', completeFormData.description);
      if (completeFormData.documents && completeFormData.documents.length > 0) {
        completeFormData.documents.forEach(doc => {
          formData.append('documents', doc);
        });
      }

      await completeMaintenance(completingTask.id, formData);
      setCompletedTaskIds(prev => new Set(prev).add(completingTask.id));
      setIsCompleteModalOpen(false);
      
      setTimeout(() => {
        loadSynthesis();
      }, 2000);
    } catch (err) {
      console.error(err);
    }
  };

  const handleReset = () => {
    setMonth(defaultMonth);
    setYear(defaultYear);
    setSelectedEnv('all');
    setIsTodayFilter(false);
    setIsOverdueFilter(false);
  };

  const currentYear = defaultYear;
  const years = Array.from({length: 10}, (_, i) => currentYear - 2 + i);

  return (
    <div className="h-full flex flex-col overflow-hidden space-y-6">
      <div className="shrink-0 bg-white p-6 border border-gray-100 mb-2 shadow-sm">
        <div className="flex flex-col md:flex-row justify-between items-start md:items-center gap-4 mb-8">
          <Typography variant="h5" className="text-[#00A651] font-bold">
            Synthesis Dashboard
          </Typography>
          <div className="flex gap-2">
            <Button 
              variant={isTodayFilter ? "contained" : "outlined"} 
              startIcon={<TodayIcon />} 
              onClick={() => { setIsTodayFilter(!isTodayFilter); setIsOverdueFilter(false); }}
              className={`font-bold rounded-none shrink-0 ${isTodayFilter ? 'bg-[#00A651]! text-white! border-[#00A651]!' : 'border-gray-200 text-gray-600 hover:bg-gray-50'}`}
            >
              Today
            </Button>
            <Button 
              variant={isOverdueFilter ? "contained" : "outlined"} 
              startIcon={<WarningAmberIcon />} 
              onClick={() => { setIsOverdueFilter(!isOverdueFilter); setIsTodayFilter(false); }}
              className={`font-bold rounded-none shrink-0 ${isOverdueFilter ? 'bg-red-600! text-white! border-red-600!' : 'border-gray-200 text-gray-600 hover:bg-red-50'}`}
            >
              Overdue
            </Button>
            <Button 
              variant="outlined" 
              startIcon={<FilterAltOffIcon />} 
              onClick={handleReset}
              className="font-bold border-gray-200 text-gray-600 hover:bg-gray-50 rounded-none shrink-0"
            >
              Reset Filters
            </Button>
          </div>
        </div>

        <div className="grid grid-cols-1 md:grid-cols-4 gap-6">
          <TextField
            size="small"
            placeholder="Search by system name..."
            value={searchQuery}
            onChange={(e) => setSearchQuery(e.target.value)}
            className="w-full"
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
          <FormControl fullWidth size="small">
            <InputLabel className="font-bold text-gray-700">Environment Filter</InputLabel>
            <Select
              value={selectedEnv}
              label="Environment Filter"
              onChange={e => setSelectedEnv(e.target.value)}
              className="rounded-none"
            >
              <MenuItem value="all">All Environments</MenuItem>
              {environments.map(env => (
                <MenuItem key={env.id} value={env.id}>{env.name}</MenuItem>
              ))}
            </Select>
          </FormControl>

          <FormControl fullWidth size="small" disabled={isTodayFilter || isOverdueFilter}>
            <InputLabel className="font-bold text-gray-700">Month</InputLabel>
            <Select
              value={month}
              label="Month"
              onChange={e => setMonth(e.target.value)}
              className="rounded-none"
            >
              <MenuItem value="all">All Months</MenuItem>
              {Array.from({length: 12}, (_, i) => (
                <MenuItem key={i+1} value={i+1}>
                  {new Date(0, i).toLocaleString('default', { month: 'long' })}
                </MenuItem>
              ))}
            </Select>
          </FormControl>

          <FormControl fullWidth size="small" disabled={isTodayFilter || isOverdueFilter}>
            <InputLabel className="font-bold text-gray-700">Year</InputLabel>
            <Select
              value={year}
              label="Year"
              onChange={e => setYear(e.target.value)}
              className="rounded-none"
            >
              <MenuItem value="all">All Years</MenuItem>
              {years.map(y => (
                <MenuItem key={y} value={y}>{y}</MenuItem>
              ))}
            </Select>
          </FormControl>
        </div>
      </div>

      <TableContainer component={Paper} elevation={0} className="flex-1 overflow-y-auto border border-[#e2e8f0] rounded-none shadow-none">
        <Table stickyHeader>
          <TableHead className="bg-gray-100/50">
            <TableRow>
              <TableCell className="font-bold! text-[#64748b]! bg-gray-100/90!">SYSTEM NAME</TableCell>
              <TableCell className="font-bold! text-[#64748b]! bg-gray-100/90!">ENVIRONMENT</TableCell>
              <TableCell className="font-bold! text-[#64748b]! bg-gray-100/90!">DESCRIPTION</TableCell>
              <TableCell className="font-bold! text-[#64748b]! bg-gray-100/90!">
                <TableSortLabel
                  active={true}
                  direction={sortOrder}
                  onClick={() => setSortOrder(prev => prev === 'asc' ? 'desc' : 'asc')}
                >
                  NEXT MAINTENANCE
                </TableSortLabel>
              </TableCell>
              <TableCell className="font-bold! text-[#64748b]! bg-gray-100/90!">STATUS</TableCell>
              <TableCell className="font-bold! text-[#64748b]! text-center! bg-gray-100/90!">ACTIONS</TableCell>
            </TableRow>
          </TableHead>
          <TableBody>
            {tasks
              .filter(task => task.name.toLowerCase().includes(searchQuery.toLowerCase()))
              .sort((a, b) => {
                const dA = new Date(a.next_maintenance_date).getTime();
                const dB = new Date(b.next_maintenance_date).getTime();
                return sortOrder === 'asc' ? dA - dB : dB - dA;
              })
              .map(task => {
                const canComplete = task.next_maintenance_date.startsWith(format(new Date(), 'yyyy-MM-dd')) || task.status === 'overdue';
                const rowKey = task.task_id || task.id;
                return (
              <TableRow key={rowKey} hover className="transition-colors border-b border-gray-100 last:border-0">
                <TableCell>
                  <span className="font-semibold text-gray-900">{task.name}</span>
                </TableCell>
                <TableCell className="text-gray-600 font-medium">{task.environment_name}</TableCell>
                <TableCell>
                  <Tooltip title={task.description || "No description available"} placement="top" arrow>
                    <div className="max-w-[240px] truncate text-gray-600 text-sm cursor-help">
                      {task.description || "-"}
                    </div>
                  </Tooltip>
                </TableCell>
                <TableCell className="font-medium text-gray-900">
                  {format(new Date(task.next_maintenance_date), 'MMM dd, yyyy')}
                </TableCell>
                <TableCell>
                  <Chip 
                    label={task.status.toUpperCase()} 
                    size="small"
                    className={`font-bold text-[11px] border shadow-xs rounded-none ${
                      task.status === 'overdue' 
                        ? 'bg-red-100! text-red-700! border-red-200!' 
                        : 'bg-yellow-100! text-yellow-800! border-yellow-200!'
                    }`}
                  />
                </TableCell>
                <TableCell align="center">
                  <div className="flex justify-center gap-2 items-center">
                    {!completedTaskIds.has(task.id) ? (
                    <Button 
                      size="small" 
                      variant="outlined" 
                      disabled={!canComplete}
                      onClick={() => handleOpenCompleteModal(task)}
                      className={`rounded-none text-[12px] py-1 px-4 shadow-none transition-all ${
                        !canComplete 
                          ? 'border-gray-200! text-gray-400!' 
                          : 'hover:shadow-md text-[#2e7d32]! border-[#2e7d32]! hover:bg-[#2e7d320a]!'
                      }`}
                    >
                      Complete
                    </Button>
                  ) : (
                    <Button 
                      size="small" 
                      variant="contained" 
                      color="success"
                      startIcon={<CheckCircleOutlineIcon />}
                      className="rounded-none text-[12px] py-1 px-4 shadow-none bg-[#2e7d32]! text-white! cursor-default pointer-events-none"
                    >
                      Done
                    </Button>
                  )}
                  </div>
                </TableCell>
              </TableRow>
            );
            })}
            {tasks.length === 0 && (
              <TableRow>
                <TableCell colSpan={6} align="center" className="py-12">
                  <Typography className="text-gray-400 italic">No maintenance tasks due for this period.</Typography>
                </TableCell>
              </TableRow>
            )}
          </TableBody>
        </Table>
      </TableContainer>

      <Dialog 
        open={isCompleteModalOpen} 
        onClose={() => setIsCompleteModalOpen(false)}
        maxWidth="sm"
        fullWidth
        PaperProps={{ className: "rounded-none" }}
      >
        <DialogTitle className="font-bold bg-gray-50 border-b border-gray-200 text-[#00A651]">
          Complete Maintenance Task
        </DialogTitle>
        <DialogContent className="pt-6! flex flex-col gap-5">
          <TextField
            label="Completion Date"
            type="date"
            fullWidth
            value={completeFormData.completion_date}
            onChange={(e) => setCompleteFormData({...completeFormData, completion_date: e.target.value})}
            slotProps={{ inputLabel: { shrink: true, className: 'bg-white px-1' } }}
            size="small"
          />
          <TextField
            label="Person Performing Task"
            fullWidth
            value={completeFormData.person}
            onChange={(e) => setCompleteFormData({...completeFormData, person: e.target.value})}
            slotProps={{ inputLabel: { shrink: true, className: 'bg-white px-1' } }}
            size="small"
          />
          <TextField
            label="Description / Notes"
            fullWidth
            multiline
            rows={4}
            value={completeFormData.description}
            onChange={(e) => setCompleteFormData({...completeFormData, description: e.target.value})}
            slotProps={{ inputLabel: { shrink: true, className: 'bg-white px-1' } }}
            size="small"
          />
          <div className="flex flex-col gap-2 pt-2">
            <Typography variant="body2" className="text-gray-600 font-medium">Upload Documents (Optional)</Typography>
            <input
              type="file"
              multiple
              onChange={(e) => {
                if (e.target.files) {
                  setCompleteFormData(prev => ({
                    ...prev,
                    documents: [...prev.documents, ...Array.from(e.target.files)]
                  }));
                  e.target.value = null;
                }
              }}
              className="block w-full text-sm text-gray-500
                file:mr-4 file:py-2 file:px-4
                file:border-0
                file:text-sm file:font-semibold
                file:bg-green-50 file:text-[#00A651]
                hover:file:bg-green-100 cursor-pointer"
            />
            {completeFormData.documents.length > 0 && (
              <div className="flex flex-wrap gap-2 mt-2">
                {completeFormData.documents.map((file, idx) => (
                  <Chip 
                    key={idx} 
                    label={file.name} 
                    onDelete={() => {
                      setCompleteFormData(prev => ({
                        ...prev,
                        documents: prev.documents.filter((_, i) => i !== idx)
                      }));
                    }}
                    size="small" 
                  />
                ))}
              </div>
            )}
          </div>
        </DialogContent>
        <DialogActions className="p-4 border-t border-gray-200">
          <Button 
            onClick={() => setIsCompleteModalOpen(false)} 
            className="text-gray-600 hover:bg-gray-50 normal-case rounded-none"
          >
            Cancel
          </Button>
          <Button 
            onClick={handleCompleteMaintenanceSubmit} 
            variant="contained" 
            className="bg-[#00A651]! hover:bg-green-700! text-white normal-case rounded-none shadow-none"
          >
            Confirm Completion
          </Button>
        </DialogActions>
      </Dialog>
    </div>
  );
};

export default SynthesisDashboard;

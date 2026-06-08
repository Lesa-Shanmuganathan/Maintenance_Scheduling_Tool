import React, { useState } from 'react';
import { 
  Typography, Button, Table, TableBody, TableCell, TableContainer, 
  TableHead, TableRow, Paper, Chip, TextField, Select, MenuItem,
  FormControl, InputLabel, LinearProgress, Tooltip
} from '@mui/material';
import { verifyClassification } from '../api';

const VerificationTable = ({ systems, onComplete, isPendingTab = false, onActionSuccess, environments = [] }) => {
  const [actionedRows, setActionedRows] = useState({});
  const [editingRow, setEditingRow] = useState(null);
  
  const [editForm, setEditForm] = useState({
    name: '',
    description: '',
    environment: '',
    location: '',
    freq_type: 'Monthly',
    freq_years: 0,
    freq_months: 0,
    freq_days: 0
  });

  const handleAction = async (system, action, index, editData = null) => {
    try {
      const payload = {
        action,
        system,
        reviewer: 'Reviewer',
        document_source: system.document_source || 'Imported Document',
        ...(editData || {})
      };
      
      if (isPendingTab && system.pending_id) {
        payload.pending_id = system.pending_id;
      }
      
      await verifyClassification(payload);
      
      setActionedRows(prev => ({ ...prev, [index]: action }));
      setEditingRow(null);
      if (onActionSuccess) onActionSuccess();
    } catch (err) {
      alert("Failed to record action: " + err);
    }
  };

  const openEdit = (system, index) => {
    setEditingRow(index);
    setEditForm({
      name: system.name || '',
      description: system.description || '',
      environment: system.environment || 'Common Facilities',
      location: system.location || '',
      freq_type: system.freq_type || 'Monthly',
      freq_years: system.freq_years || 0,
      freq_months: system.freq_months || 0,
      freq_days: system.freq_days || 0
    });
  };

  const saveEdit = (system, index) => {
    handleAction(system, 'edit', index, {
      corrected_name: editForm.name,
      corrected_description: editForm.description,
      corrected_environment: editForm.environment,
      corrected_location: editForm.location,
      corrected_freq_type: editForm.freq_type,
      corrected_freq_years: parseInt(editForm.freq_years) || 0,
      corrected_freq_months: parseInt(editForm.freq_months) || 0,
      corrected_freq_days: parseInt(editForm.freq_days) || 0
    });
  };

  const formatFreqLabel = (sys) => {
    const years = sys.freq_years || 0;
    const months = sys.freq_months || 0;
    const days = sys.freq_days || 0;
    const type = sys.freq_type || '';

    // For any type with a numeric count, show it explicitly
    if (type === 'Custom' || months > 1 || years > 1 || days > 1) {
      const parts = [];
      if (years) parts.push(years === 1 ? '1 Year' : `${years} Years`);
      if (months) parts.push(months === 1 ? '1 Month' : `${months} Months`);
      if (days) parts.push(days === 1 ? '1 Day' : `${days} Days`);
      if (parts.length) return parts.join(' ');
    }

    // Use the human-readable label from the document if distinct from the type
    if (sys.freq_label && sys.freq_label !== type) return sys.freq_label;

    // Pretty-print standard types
    const labels = { Daily: '1 Day', Weekly: '1 Week', Monthly: '1 Month', 'Half Yearly': '6 Months', Yearly: '1 Year' };
    return labels[type] || type || '-';
  };

  const getEnvColor = (env) => {
    if (env === 'Test Bed') return 'bg-green-100 text-green-800 border-green-200';
    if (env === 'Chassis Dyno') return 'bg-purple-100 text-purple-800 border-purple-200';
    return 'bg-blue-100 text-blue-800 border-blue-200';
  };

  const getConfidenceColor = (conf) => {
    if (conf >= 0.85) return 'success';
    if (conf >= 0.65) return 'warning';
    return 'error';
  };

  const allActioned = systems.length > 0 && Object.keys(actionedRows).length === systems.length;

  return (
    <div className="flex flex-col h-full bg-gray-50 p-6">
      <div className="flex justify-between items-center mb-6">
        <div>
          <Typography variant="h5" className="font-bold text-gray-900 mb-1">
            {isPendingTab ? 'Pending Review' : 'Verify Classification'}
          </Typography>
          <Typography className="text-gray-600 text-sm">
            {Object.keys(actionedRows).length} of {systems.length} systems reviewed
          </Typography>
        </div>
        {(!isPendingTab && allActioned) && (
          <Button 
            variant="contained" 
            onClick={onComplete}
            className="bg-[#00A651]! text-white! font-bold py-2.5 px-8 rounded-none shadow-md"
          >
            Finish Import
          </Button>
        )}
      </div>

      <TableContainer component={Paper} elevation={0} className="border border-gray-200 rounded-none shadow-sm flex-1 overflow-auto">
        <Table stickyHeader>
          <TableHead>
            <TableRow>
              <TableCell className="font-bold! bg-gray-100! text-gray-700! w-1/5">SYSTEM DETAILS</TableCell>
              <TableCell className="font-bold! bg-gray-100! text-gray-700! w-1/5">AI PREDICTION</TableCell>
              <TableCell className="font-bold! bg-gray-100! text-gray-700! w-[14%]">CONFIDENCE</TableCell>
              <TableCell className="font-bold! bg-gray-100! text-gray-700! w-[14%]">MAINTENANCE PERIOD</TableCell>
              <TableCell className="font-bold! bg-gray-100! text-gray-700! text-center! w-1/4">ACTIONS</TableCell>
            </TableRow>
          </TableHead>
          <TableBody>
            {systems.map((sys, index) => {
              const status = actionedRows[index];
              const isEditing = editingRow === index;

              return (
                <React.Fragment key={index}>
                  <TableRow hover className={status ? 'bg-gray-50/50' : 'bg-white'}>
                    <TableCell>
                      <Typography className="font-bold text-gray-900 text-[15px] mb-1">{sys.name}</Typography>
                      <Tooltip title={sys.description || ''} arrow placement="bottom">
                        <Typography className="text-gray-500 text-[13px] line-clamp-2">{sys.description || '-'}</Typography>
                      </Tooltip>
                    </TableCell>
                    <TableCell>
                      <Chip 
                        label={sys.environment} 
                        className={`font-bold! rounded-none border! ${getEnvColor(sys.environment)}`} 
                        size="small"
                      />
                    </TableCell>
                    <TableCell>
                      <div className="flex flex-col gap-1 w-full max-w-[120px]">
                        <div className="flex justify-between items-center">
                          <Typography className="font-bold text-[13px]">{(sys.confidence * 100).toFixed(0)}%</Typography>
                          {sys.confidence < 0.65 && <span className="text-[10px] font-bold text-red-600 uppercase tracking-wider">Flagged</span>}
                        </div>
                        <LinearProgress 
                          variant="determinate" 
                          value={sys.confidence * 100} 
                          color={getConfidenceColor(sys.confidence)} 
                          className="h-2! rounded-none!"
                        />
                        <Tooltip title={sys.reason || ''} arrow placement="top">
                          <Typography className="text-gray-400 text-[10px] truncate max-w-[150px] mt-1 cursor-help">{sys.reason}</Typography>
                        </Tooltip>
                      </div>
                    </TableCell>
                    <TableCell>
                      <span className="inline-flex items-center gap-1 px-2 py-1 bg-indigo-50 border border-indigo-100 text-indigo-800 text-[12px] font-semibold rounded-sm whitespace-nowrap">
                        {formatFreqLabel(sys)}
                      </span>
                    </TableCell>
                    <TableCell align="center">
                      {status ? (
                        <Chip 
                          label={status.charAt(0).toUpperCase() + status.slice(1)} 
                          className="font-bold! bg-gray-200! text-gray-700! rounded-none"
                        />
                      ) : isEditing ? (
                        <div className="text-gray-400 italic text-sm">Editing below...</div>
                      ) : (
                        <div className="flex justify-center gap-2 flex-wrap">
                          <Button 
                            variant="outlined" 
                            size="small"
                            onClick={() => handleAction(sys, 'accept', index)}
                            className="border-green-600! text-green-700! hover:bg-green-50! rounded-none font-bold normal-case"
                          >
                            Accept
                          </Button>
                          <Button 
                            variant="outlined" 
                            size="small"
                            onClick={() => openEdit(sys, index)}
                            className="border-blue-600! text-blue-700! hover:bg-blue-50! rounded-none font-bold normal-case"
                          >
                            Edit
                          </Button>
                          <Button 
                            variant="outlined" 
                            size="small"
                            onClick={() => handleAction(sys, 'hold', index)}
                            className="border-amber-600! text-amber-700! hover:bg-amber-50! rounded-none font-bold normal-case"
                          >
                            Hold In
                          </Button>
                          <Button 
                            variant="outlined" 
                            size="small"
                            onClick={() => {
                              if(window.confirm('Remove this entry? This cannot be undone.')){
                                handleAction(sys, 'delete', index);
                              }
                            }}
                            className="border-red-600! text-red-700! hover:bg-red-50! rounded-none font-bold normal-case"
                          >
                            Delete
                          </Button>
                        </div>
                      )}
                    </TableCell>
                  </TableRow>
                  {isEditing && (
                    <TableRow className="bg-blue-50/30">
                      <TableCell colSpan={5} className="p-0 border-b border-blue-100">
                        <div className="p-4 flex flex-col gap-4 border-l-4 border-blue-500 m-2 bg-white shadow-sm">
                           <Typography variant="subtitle2" className="font-bold text-blue-800">Edit Classification</Typography>
                           <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                             <TextField 
                               label="System Name" 
                               size="small" 
                               value={editForm.name}
                               onChange={e => setEditForm({...editForm, name: e.target.value})}
                               fullWidth
                             />
                             <FormControl size="small" fullWidth>
                               <InputLabel>Environment</InputLabel>
                               <Select
                                 label="Environment"
                                 value={editForm.environment}
                                 onChange={e => setEditForm({...editForm, environment: e.target.value, location: ''})}
                               >
                                 {environments.length > 0
                                   ? environments.map(env => (
                                       <MenuItem key={env.id} value={env.name}>{env.name}</MenuItem>
                                     ))
                                   : [
                                       <MenuItem key="tb" value="Test Bed">Test Bed</MenuItem>,
                                       <MenuItem key="cd" value="Chassis Dyno">Chassis Dyno</MenuItem>,
                                       <MenuItem key="cf" value="Common Facilities">Common Facilities</MenuItem>
                                     ]
                                 }
                               </Select>
                             </FormControl>
                             <FormControl size="small" fullWidth>
                               <InputLabel>Location</InputLabel>
                               <Select
                                 label="Location"
                                 value={editForm.location}
                                 onChange={e => setEditForm({...editForm, location: e.target.value})}
                               >
                                 <MenuItem value="">Unassigned</MenuItem>
                                 {(environments.find(env => env.name === editForm.environment)?.locations || []).map(loc => (
                                   <MenuItem key={loc.id} value={loc.code}>{loc.code}{loc.description ? ` — ${loc.description}` : ''}</MenuItem>
                                 ))}
                               </Select>
                             </FormControl>
                             <TextField 
                               label="Description" 
                               size="small" 
                               value={editForm.description}
                               onChange={e => setEditForm({...editForm, description: e.target.value})}
                               fullWidth
                               multiline
                               rows={2}
                               className="md:col-span-2"
                             />
                             {/* Frequency editing */}
                             <div className="md:col-span-2 border-t border-gray-100 pt-3 mt-1">
                               <Typography variant="caption" className="font-bold text-gray-500 uppercase tracking-wide block mb-2">Maintenance Period</Typography>
                               <div className="grid grid-cols-2 md:grid-cols-4 gap-3">
                                 <FormControl size="small" fullWidth className="md:col-span-2">
                                   <InputLabel>Frequency Type</InputLabel>
                                   <Select
                                     label="Frequency Type"
                                     value={editForm.freq_type}
                                     onChange={e => setEditForm({...editForm, freq_type: e.target.value, freq_years: 0, freq_months: 0, freq_days: 0})}
                                   >
                                     <MenuItem value="Daily">Daily (1 Day)</MenuItem>
                                     <MenuItem value="Weekly">Weekly (1 Week)</MenuItem>
                                     <MenuItem value="Monthly">Monthly (1 Month)</MenuItem>
                                     <MenuItem value="Half Yearly">Half Yearly (6 Months)</MenuItem>
                                     <MenuItem value="Yearly">Yearly (1 Year)</MenuItem>
                                     <MenuItem value="Custom">Custom Interval</MenuItem>
                                   </Select>
                                 </FormControl>
                                 {editForm.freq_type === 'Custom' && (
                                   <>
                                     <TextField
                                       size="small"
                                       label="Years"
                                       type="number"
                                       value={editForm.freq_years}
                                       onChange={e => setEditForm({...editForm, freq_years: e.target.value})}
                                       slotProps={{ htmlInput: { min: 0 } }}
                                     />
                                     <TextField
                                       size="small"
                                       label="Months"
                                       type="number"
                                       value={editForm.freq_months}
                                       onChange={e => setEditForm({...editForm, freq_months: e.target.value})}
                                       slotProps={{ htmlInput: { min: 0 } }}
                                     />
                                     <TextField
                                       size="small"
                                       label="Days"
                                       type="number"
                                       value={editForm.freq_days}
                                       onChange={e => setEditForm({...editForm, freq_days: e.target.value})}
                                       slotProps={{ htmlInput: { min: 0 } }}
                                     />
                                   </>
                                 )}
                               </div>
                             </div>
                           </div>
                          <div className="flex gap-2 justify-end">
                            <Button 
                              variant="outlined" 
                              onClick={() => setEditingRow(null)}
                              className="rounded-none normal-case text-gray-600 border-gray-300"
                            >
                              Cancel
                            </Button>
                            <Button 
                              variant="contained" 
                              onClick={() => saveEdit(sys, index)}
                              className="bg-blue-600! text-white! rounded-none normal-case font-bold"
                            >
                              Save
                            </Button>
                          </div>
                        </div>
                      </TableCell>
                    </TableRow>
                  )}
                </React.Fragment>
              );
            })}
            {systems.length === 0 && (
              <TableRow>
                <TableCell colSpan={5} align="center" className="py-12">
                  <Typography className="text-gray-500 italic">No systems found.</Typography>
                </TableCell>
              </TableRow>
            )}
          </TableBody>
        </Table>
      </TableContainer>
    </div>
  );
};

export default VerificationTable;

import React, { useState, useEffect } from 'react';
import { format } from 'date-fns';
import { 
  Dialog, DialogTitle, DialogContent, DialogActions, Button, 
  TextField, FormControl, InputLabel, Select, MenuItem, Typography 
} from '@mui/material';

const EquipmentModal = ({ isOpen, onClose, onSave, environmentId, environments, initialData }) => {
  const [formData, setFormData] = useState({
    name: '',
    description: '',
    serial_number: '',
    location: '',
    environment_id: environmentId,
    commissioning_date: format(new Date(), 'yyyy-MM-dd'),
    freq_type: 'Monthly',
    freq_days: 0,
    freq_months: 0,
    freq_years: 0
  });

  useEffect(() => {
    if (initialData) {
      setFormData({
        ...initialData,
        serial_number: initialData.serial_number || '',
        location: initialData.location || '',
        commissioning_date: initialData.commissioning_date.split('T')[0]
      });
    } else {
      setFormData({
        name: '',
        description: '',
        serial_number: '',
        location: '',
        environment_id: environmentId,
        commissioning_date: format(new Date(), 'yyyy-MM-dd'),
        freq_type: 'Monthly',
        freq_days: 0,
        freq_months: 0,
        freq_years: 0
      });
    }
  }, [initialData, environmentId, isOpen]);

  const handleChange = (e) => {
    const { name, value } = e.target;
    setFormData(prev => ({ ...prev, [name]: value }));
  };

  const handleSubmit = (e) => {
    e.preventDefault();
    onSave(formData);
  };

  return (
    <Dialog 
      open={isOpen} 
      onClose={onClose} 
      fullWidth 
      maxWidth="sm" 
      PaperProps={{ className: 'rounded-none overflow-hidden shadow-2xl' }}
    >
      <DialogTitle className="font-bold text-gray-900 border-b border-gray-100 py-5 px-8">
        {initialData ? 'Edit Equipment' : 'Add New Equipment'}
      </DialogTitle>
      
      <form onSubmit={handleSubmit} className="p-2">
        <DialogContent className="pt-6 pb-2 px-8">
          <div className="flex flex-col gap-6 pt-2">
            <TextField
              name="name"
              label="System Name"
              fullWidth
              required
              value={formData.name}
              onChange={handleChange}
              placeholder="Enter system name (e.g., Dyno rig X1)"
              slotProps={{ input: { className: 'rounded-none' }, inputLabel: { className: 'bg-white px-1' } }}
            />

            <TextField
              name="serial_number"
              label="Serial Number"
              fullWidth
              value={formData.serial_number}
              onChange={handleChange}
              placeholder="Optional"
              slotProps={{ input: { className: 'rounded-none' }, inputLabel: { className: 'bg-white px-1' } }}
            />

            <FormControl fullWidth required>
              <InputLabel id="location-label" className="font-bold text-gray-700 bg-white px-1">Location (Environment)</InputLabel>
              <Select
                labelId="location-label"
                name="environment_id"
                label="Location (Environment)"
                value={formData.environment_id || ''}
                onChange={handleChange}
                className="rounded-none"
              >
                {environments && environments.map(env => (
                  <MenuItem key={env.id} value={env.id}>{env.name}</MenuItem>
                ))}
              </Select>
            </FormControl>
            
            <TextField
              name="description"
              label="Description"
              fullWidth
              multiline
              rows={3}
              value={formData.description}
              onChange={handleChange}
              placeholder="Briefly describe the equipment"
              slotProps={{ input: { className: 'rounded-none' }, inputLabel: { className: 'bg-white px-1' } }}
            />
            
            <TextField
              name="commissioning_date"
              label="Commissioning Date"
              type="date"
              fullWidth
              required
              slotProps={{ inputLabel: { shrink: true, className: 'bg-white px-1' }, input: { className: 'rounded-none' } }}
              value={formData.commissioning_date}
              onChange={handleChange}
            />
            
            <FormControl fullWidth>
              <InputLabel id="freq-type-label" className="font-bold text-gray-700 bg-white px-1">Frequency Type</InputLabel>
              <Select
                labelId="freq-type-label"
                name="freq_type"
                label="Frequency Type"
                value={formData.freq_type}
                onChange={handleChange}
                className="rounded-none"
              >
                <MenuItem value="Daily">Daily</MenuItem>
                <MenuItem value="Weekly">Weekly</MenuItem>
                <MenuItem value="Monthly">Monthly</MenuItem>
                <MenuItem value="Yearly">Yearly</MenuItem>
                <MenuItem value="Custom">Custom Interval</MenuItem>
              </Select>
            </FormControl>

            {formData.freq_type === 'Custom' && (
              <div className="p-5 bg-gray-50 rounded-none border border-gray-100 flex flex-col gap-4">
                <Typography className="text-[11px] font-bold tracking-widest text-[#00A651] uppercase">
                  Set Custom Duration
                </Typography>
                <div className="grid grid-cols-3 gap-4">
                  <TextField
                    name="freq_years"
                    label="Years"
                    type="number"
                    size="small"
                    value={formData.freq_years}
                    onChange={handleChange}
                    slotProps={{ htmlInput: { min: 0 }, input: { className: 'rounded-none' }, inputLabel: { className: 'bg-[#f8f9fa] px-1' } }}
                  />
                  <TextField
                    name="freq_months"
                    label="Months"
                    type="number"
                    size="small"
                    value={formData.freq_months}
                    onChange={handleChange}
                    slotProps={{ htmlInput: { min: 0 }, input: { className: 'rounded-none' }, inputLabel: { className: 'bg-[#f8f9fa] px-1' } }}
                  />
                  <TextField
                    name="freq_days"
                    label="Days"
                    type="number"
                    size="small"
                    value={formData.freq_days}
                    onChange={handleChange}
                    slotProps={{ htmlInput: { min: 0 }, input: { className: 'rounded-none' }, inputLabel: { className: 'bg-[#f8f9fa] px-1' } }}
                  />
                </div>
              </div>
            )}
          </div>
        </DialogContent>
        
        <DialogActions className="p-6 pt-2 gap-3 px-8">
          <Button 
            onClick={onClose} 
            className="text-gray-500 font-bold hover:bg-gray-50 px-6 rounded-none normal-case"
          >
            Cancel
          </Button>
          <Button 
            type="submit" 
            variant="contained" 
            className="bg-black! text-white! font-bold py-2.5 px-8 rounded-none shadow-lg hover:bg-gray-800! transition-all normal-case ring-offset-2 focus:ring-2 focus:ring-black"
          >
            {initialData ? 'Update Record' : 'Save Equipment'}
          </Button>
        </DialogActions>
      </form>
    </Dialog>
  );
};

export default EquipmentModal;

import React, { useState, useEffect, useRef } from 'react';
import { 
  Dialog, DialogTitle, DialogContent, Typography, 
  Button, TextField, DialogActions, Box
} from '@mui/material';
import IconButton from '@mui/material/IconButton';
import CloseIcon from '@mui/icons-material/Close';
import axios from 'axios';
import dayjs from 'dayjs';

import FullCalendar from '@fullcalendar/react';
import dayGridPlugin from '@fullcalendar/daygrid';
import interactionPlugin from '@fullcalendar/interaction';
import multiMonthPlugin from '@fullcalendar/multimonth';

const CALENDAR_API = 'http://127.0.0.1:5000/api/equipments';

const CalendarModal = ({ isOpen, onClose, equipmentId, equipmentName }) => {
  const [scheduledDates, setScheduledDates] = useState([]);
  const [loading, setLoading] = useState(true);
  const [initialMonth, setInitialMonth] = useState(null);
  
  const calendarRef = useRef(null);

  // Edit popover state
  const [editingDate, setEditingDate] = useState(null);
  const [newDateValue, setNewDateValue] = useState('');

  const fetchCalendar = async (isRefresh = false) => {
    if (!isOpen || !equipmentId) return;
    try {
      if (!isRefresh) setLoading(true);
      const res = await axios.get(`${CALENDAR_API}/${equipmentId}/calendar`);
      setScheduledDates(res.data);
      
      if (!isRefresh) {
        const todayStr = dayjs().format('YYYY-MM-DD');
        const upcoming = res.data.find(d => d.actual_date >= todayStr);
        let targetMonth = dayjs();
        
        if (upcoming) {
          targetMonth = dayjs(upcoming.actual_date);
        } else if (res.data.length > 0) {
          targetMonth = dayjs(res.data[0].actual_date);
        }
        
        setInitialMonth(targetMonth.format('YYYY-MM-DD'));
        
        if (calendarRef.current) {
          calendarRef.current.getApi().gotoDate(targetMonth.format('YYYY-MM-DD'));
        }
      }
    } catch (err) {
      console.error(err);
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    fetchCalendar(false);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [isOpen, equipmentId]);

  const handleOverrideSubmit = async () => {
    if (!editingDate || !newDateValue) return;
    try {
      await axios.post(`${CALENDAR_API}/${equipmentId}/calendar/override`, {
        original_date: editingDate.original_date,
        new_date: newDateValue
      });
      setEditingDate(null);
      setNewDateValue('');
      await fetchCalendar(true);
    } catch (err) {
      console.error(err);
      alert('Failed to update maintenance date');
    }
  };

  const handleResetOverride = async (original_date) => {
    try {
       await axios.post(`${CALENDAR_API}/${equipmentId}/calendar/override`, {
        original_date: original_date,
        new_date: original_date
      });
      setEditingDate(null);
      await fetchCalendar(true);
    } catch (err) {
      console.error(err);
    }
  };

  const events = scheduledDates.map(task => ({
    id: task.actual_date,
    title: task.is_overridden ? 'MODIFIED' : 'MAINTENANCE',
    date: task.actual_date,
    extendedProps: task,
    backgroundColor: task.is_overridden ? '#f59e0b' : '#00A651',
    borderColor: task.is_overridden ? '#d97706' : '#00A651',
    textColor: '#ffffff'
  }));

  return (
    <>
      <Dialog open={isOpen} onClose={onClose} maxWidth="lg" fullWidth PaperProps={{ className: "rounded-lg" }}>
        <DialogTitle className="flex justify-between items-center bg-white border-b border-gray-200 shadow-sm z-10">
          <span className="font-bold text-gray-800 text-lg">Full Maintenance Schedule • {equipmentName}</span>
          <IconButton onClick={onClose} size="small"><CloseIcon /></IconButton>
        </DialogTitle>
        <DialogContent className="p-0 bg-gray-50 flex flex-col min-h-[700px]">
          {loading && !initialMonth ? (
            <div className="flex flex-1 items-center justify-center h-[500px]">
              <Typography className="text-gray-500 font-medium">Loading schedule...</Typography>
            </div>
          ) : (
            <Box className="w-full h-full bg-white p-6 md:p-8" sx={{
               '& .fc-toolbar-title': { fontSize: '1.5rem', fontWeight: 700, color: '#1f2937' },
               '& .fc-button-primary': { backgroundColor: '#111827', borderColor: '#111827', textTransform: 'capitalize', fontWeight: 'bold' },
               '& .fc-button-primary:hover': { backgroundColor: '#374151' },
               '& .fc-daygrid-day-number': { color: '#4b5563', fontWeight: 600, padding: '4px' },
               '& .fc-daygrid-event': { cursor: 'pointer', padding: '2px 4px', borderRadius: '4px', fontWeight: 'bold', border: '1px solid', margin: '2px 4px' },
               '& .fc-theme-standard td, & .fc-theme-standard th': { borderColor: '#e5e7eb' },
               '& .fc-col-header-cell-cushion': { color: '#6b7280', fontWeight: 600, padding: '8px 0' },
               '& .fc-day-today': { backgroundColor: '#f9fafb !important' }
            }}>
              <FullCalendar
                ref={calendarRef}
                plugins={[dayGridPlugin, interactionPlugin, multiMonthPlugin]}
                initialView="dayGridMonth"
                initialDate={initialMonth || undefined}
                events={events}
                height={650}
                headerToolbar={{
                  left: 'prev,next today',
                  center: 'title',
                  right: 'dayGridMonth,multiMonthYear'
                }}
                buttonText={{
                  dayGridMonth: 'Month',
                  multiMonthYear: 'Year'
                }}
                eventClick={(info) => {
                   const task = info.event.extendedProps;
                   setEditingDate(task);
                   setNewDateValue(task.actual_date);
                }}
                dateClick={(info) => {
                   const dayStr = info.dateStr;
                   const task = scheduledDates.find(d => d.actual_date === dayStr);
                   if (task) {
                     setEditingDate(task);
                     setNewDateValue(task.actual_date);
                   }
                }}
              />
            </Box>
          )}
        </DialogContent>
      </Dialog>

      {/* Edit Date Dialog */}
      {/* Edit Date Dialog */}
      <Dialog 
        open={!!editingDate} 
        onClose={() => setEditingDate(null)} 
        PaperProps={{ 
          sx: { borderRadius: '12px', minWidth: '380px', padding: 0 }
        }}
      >
        <DialogTitle sx={{ fontWeight: 'bold', borderBottom: '1px solid #f3f4f6', backgroundColor: '#f9fafb', color: '#1f2937', px: 3, py: 2.5, fontSize: '1.25rem' }}>
          Edit Maintenance Date
        </DialogTitle>
        <DialogContent sx={{ px: 3, pb: 4, pt: '28px !important', overflowY: 'visible' }}>
          <Typography sx={{ color: '#4b5563', fontSize: '15px', mb: 3.5, lineHeight: 1.6 }}>
            Reschedule the maintenance originally planned for <strong style={{color: '#111827', borderBottom: '2px solid #bbf7d0', paddingBottom: '1px'}}>{editingDate?.original_date}</strong>.
          </Typography>
          <TextField
            type="date"
            fullWidth
            label="New Date"
            InputLabelProps={{ shrink: true }}
            value={newDateValue}
            onChange={(e) => setNewDateValue(e.target.value)}
            sx={{
               mt: 1,
               '& .MuiOutlinedInput-root': { borderRadius: '8px' }
            }}
          />
        </DialogContent>
        <DialogActions sx={{ px: 3, py: 2.5, backgroundColor: '#f9fafb', borderTop: '1px solid #f3f4f6' }}>
          {editingDate?.is_overridden && (
             <Button 
               onClick={() => handleResetOverride(editingDate.original_date)}
               sx={{ color: '#d97706', fontWeight: 'bold', textTransform: 'none', mr: 'auto', border: '1px solid #fde68a', backgroundColor: '#fff', '&:hover': { backgroundColor: '#fef3c7' }, px: 2 }}
             >
               Reset Date
             </Button>
          )}
          <Button onClick={() => setEditingDate(null)} sx={{ color: '#4b5563', fontWeight: 'bold', textTransform: 'none', px: 2, '&:hover': { backgroundColor: '#f3f4f6' } }}>Cancel</Button>
          <Button 
            onClick={handleOverrideSubmit} 
            variant="contained"
            sx={{ backgroundColor: '#00A651', '&:hover': { backgroundColor: '#008f45' }, borderRadius: '6px', fontWeight: 'bold', textTransform: 'none', px: 3, py: 1, boxShadow: 'none' }}
          >
            Save Change
          </Button>
        </DialogActions>
      </Dialog>
    </>
  );
};

export default CalendarModal;

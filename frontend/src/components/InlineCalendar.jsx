import React, { useState, useEffect } from 'react';
import { fetchCalendarEvents, fetchEquipments } from '../api';
import { Typography, IconButton, Tooltip, Popover, Chip } from '@mui/material';
import ArrowBackIosNewIcon from '@mui/icons-material/ArrowBackIosNew';
import ArrowForwardIosIcon from '@mui/icons-material/ArrowForwardIos';
import { format, addMonths, subMonths, startOfMonth, endOfMonth, eachDayOfInterval, getDay, isToday, parseISO } from 'date-fns';

const InlineCalendar = ({ environmentId, refreshKey = 0 }) => {
  const [currentDate, setCurrentDate] = useState(new Date());
  const [events, setEvents] = useState([]);
  const [overdueEquipments, setOverdueEquipments] = useState([]);
  const [selectedDay, setSelectedDay] = useState(null);
  const [dayPopoverAnchor, setDayPopoverAnchor] = useState(null);
  const [overdueAnchor, setOverdueAnchor] = useState(null);
  
  useEffect(() => {
    const loadEvents = async () => {
      try {
        const res = await fetchCalendarEvents(environmentId, currentDate.getMonth() + 1, currentDate.getFullYear());
        setEvents(res.data);
      } catch (err) {
        console.error(err);
      }
    };
    loadEvents();
  }, [environmentId, currentDate, refreshKey]);

  useEffect(() => {
    const loadOverdue = async () => {
      try {
        const res = await fetchEquipments(environmentId);
        const today = new Date();
        today.setHours(0, 0, 0, 0);

        const overdue = res.data
          .filter(eq => eq.standby !== 1 && eq.next_maintenance_date)
          .filter(eq => {
            const due = parseISO(eq.next_maintenance_date);
            due.setHours(0, 0, 0, 0);
            return due < today;
          })
          .sort((a, b) => parseISO(a.next_maintenance_date) - parseISO(b.next_maintenance_date));

        setOverdueEquipments(overdue);
      } catch (err) {
        console.error(err);
      }
    };

    loadOverdue();
  }, [environmentId, refreshKey]);

  const [view, setView] = useState('month');

  const handlePrev = () => setCurrentDate(prev => view === 'month' ? subMonths(prev, 1) : addMonths(prev, -12));
  const handleNext = () => setCurrentDate(prev => view === 'month' ? addMonths(prev, 1) : addMonths(prev, 12));
  const handleToday = () => setCurrentDate(new Date());

  const monthStart = startOfMonth(currentDate);
  const monthEnd = endOfMonth(monthStart);
  const days = eachDayOfInterval({ start: monthStart, end: monthEnd });
  
  const startDay = getDay(monthStart);
  const calendarCells = [
    ...Array.from({ length: startDay }, () => null),
    ...days
  ];

  while (calendarCells.length < 42) {
    calendarCells.push(null);
  }

  const getEventsForDay = (day) => {
    return events.filter(e => {
      const eDate = parseISO(e.due_date);
      return eDate.getDate() === day.getDate() && eDate.getMonth() === day.getMonth() && eDate.getFullYear() === day.getFullYear();
    });
  };

  const getStatusColor = (status) => {
    switch (status) {
      case 'overdue': return 'bg-[#C0392B]';
      case 'due_soon': return 'bg-[#E67E22]';
      case 'upcoming': return 'bg-[#00A651]';
      default: return 'bg-gray-400';
    }
  };

  const openDayPopover = (event, day) => {
    setSelectedDay(day);
    setDayPopoverAnchor(event.currentTarget);
  };

  const selectedDayEvents = selectedDay ? getEventsForDay(selectedDay) : [];

  return (
    <div className="bg-[#FAFAFA] border-l border-gray-200 h-full p-3 flex flex-col min-h-0">
      <div className="flex flex-wrap justify-between items-center gap-2 mb-2 shrink-0">
        <Typography variant="subtitle1" className="font-bold text-gray-800">
          {format(currentDate, view === 'month' ? 'MMMM yyyy' : 'yyyy')}
        </Typography>
        <div className="flex gap-1 items-center">
          <div className="bg-gray-200 rounded p-0.5 flex">
            <button className={`text-[11px] px-1.5 py-0.5 rounded ${view === 'month' ? 'bg-white shadow-sm' : ''}`} onClick={() => setView('month')}>Month</button>
            <button className={`text-[11px] px-1.5 py-0.5 rounded ${view === 'year' ? 'bg-white shadow-sm' : ''}`} onClick={() => setView('year')}>Year</button>
          </div>
          <button type="button" onClick={handleToday} className="text-[11px] font-bold text-gray-600 px-1.5 py-1 hover:text-gray-900">
            Today
          </button>
          <IconButton size="small" onClick={handlePrev}><ArrowBackIosNewIcon fontSize="inherit" /></IconButton>
          <IconButton size="small" onClick={handleNext}><ArrowForwardIosIcon fontSize="inherit" /></IconButton>
        </div>
      </div>

      {view === 'month' && overdueEquipments.length > 0 && (
        <div className="mb-2 shrink-0 rounded border border-red-200 bg-red-50 px-2 py-1.5">
          <div className="flex items-center justify-between gap-2">
            <div className="min-w-0">
              <div className="text-[11px] font-bold text-[#C0392B]">Overdue maintenance</div>
              <div className="text-[10px] text-red-700 truncate">
                Oldest: {overdueEquipments[0].name} ({format(parseISO(overdueEquipments[0].next_maintenance_date), 'MMM dd, yyyy')})
              </div>
            </div>
            <Chip
              label={overdueEquipments.length}
              size="small"
              onClick={(event) => setOverdueAnchor(event.currentTarget)}
              className="bg-[#C0392B]! text-white! font-bold cursor-pointer"
            />
          </div>
        </div>
      )}
      
      {view === 'month' ? (
        <>
          <div className="grid grid-cols-7 gap-1 mb-1 shrink-0">
            {['Su', 'Mo', 'Tu', 'We', 'Th', 'Fr', 'Sa'].map(d => (
              <div key={d} className="text-center text-[10px] font-bold text-gray-400 py-0.5">{d}</div>
            ))}
          </div>
          
          <div className="grid grid-cols-7 grid-rows-6 gap-1 flex-1 min-h-[300px] overflow-hidden">
            {calendarCells.map((day, index) => {
              if (!day) {
                return <div key={`empty-${index}`} className="bg-transparent min-h-0" />;
              }

              const dayEvents = getEventsForDay(day);
              const isCurrToday = isToday(day);
              return (
                <div key={day.toString()} className={`relative bg-white border ${isCurrToday ? 'border-[#00A651]' : 'border-gray-100'} p-1 min-h-0 flex flex-col overflow-hidden`}>
                  <div className={`text-[11px] font-bold ${isCurrToday ? 'text-[#00A651]' : 'text-gray-500'} ml-0.5`}>
                    {format(day, 'd')}
                  </div>
                  {dayEvents.length > 0 && (
                    <div className="flex flex-1 items-center justify-center min-h-0">
                      <Tooltip title={`${dayEvents.length} system${dayEvents.length > 1 ? 's' : ''} due`} placement="top">
                        <button
                          type="button"
                          aria-label={`Show systems due on ${format(day, 'MMMM d')}`}
                          onClick={(event) => openDayPopover(event, day)}
                          className="w-[18px] h-[18px] rounded-sm bg-blue-600 text-white text-[9px] leading-none font-bold shadow-sm hover:bg-blue-700 focus:outline-none focus:ring-2 focus:ring-blue-300"
                        >
                          {dayEvents.length > 99 ? '99' : dayEvents.length}
                        </button>
                      </Tooltip>
                    </div>
                  )}
                </div>
              );
            })}
          </div>
          <Popover
            open={Boolean(dayPopoverAnchor)}
            anchorEl={dayPopoverAnchor}
            onClose={() => setDayPopoverAnchor(null)}
            anchorOrigin={{ vertical: 'bottom', horizontal: 'center' }}
            transformOrigin={{ vertical: 'top', horizontal: 'center' }}
            PaperProps={{ className: 'rounded-md border border-blue-100 shadow-xl' }}
          >
            <div className="w-[280px] max-w-[80vw] p-3">
              <div className="text-sm font-bold text-gray-900 mb-2">
                {selectedDay ? format(selectedDay, 'MMMM d, yyyy') : ''}
              </div>
              <div className="flex flex-col gap-1.5 max-h-[260px] overflow-y-auto pr-1">
                {selectedDayEvents.map((ev, i) => (
                  <div key={`${ev.equipment_id}-${i}`} className="flex items-center gap-2 min-w-0">
                    <span className={`w-2 h-2 shrink-0 rounded-full ${getStatusColor(ev.status)}`} />
                    <span className="text-xs font-semibold text-gray-800 truncate" title={ev.equipment_name}>
                      {ev.equipment_name}
                    </span>
                  </div>
                ))}
              </div>
            </div>
          </Popover>
          <Popover
            open={Boolean(overdueAnchor)}
            anchorEl={overdueAnchor}
            onClose={() => setOverdueAnchor(null)}
            anchorOrigin={{ vertical: 'bottom', horizontal: 'right' }}
            transformOrigin={{ vertical: 'top', horizontal: 'right' }}
            PaperProps={{ className: 'rounded-md border border-red-100 shadow-xl' }}
          >
            <div className="w-[320px] max-w-[85vw] p-3">
              <div className="text-sm font-bold text-[#C0392B] mb-2">
                Overdue systems
              </div>
              <div className="flex flex-col gap-2 max-h-[320px] overflow-y-auto pr-1">
                {overdueEquipments.map(eq => (
                  <div key={eq.id} className="border-b border-gray-100 pb-2 last:border-0 last:pb-0">
                    <div className="text-xs font-bold text-gray-900 truncate" title={eq.name}>{eq.name}</div>
                    <div className="text-[11px] text-gray-500">
                      Due {format(parseISO(eq.next_maintenance_date), 'MMM dd, yyyy')}
                    </div>
                  </div>
                ))}
              </div>
            </div>
          </Popover>
        </>
      ) : (
        <div className="grid grid-cols-3 gap-2 flex-1">
          {Array.from({ length: 12 }).map((_, i) => {
            const m = new Date(currentDate.getFullYear(), i, 1);
            return (
              <div key={i} className="bg-white border border-gray-100 p-2 flex items-center justify-center cursor-pointer hover:bg-gray-50" onClick={() => { setCurrentDate(m); setView('month'); }}>
                <span className="font-bold text-gray-700">{format(m, 'MMM')}</span>
              </div>
            );
          })}
        </div>
      )}
    </div>
  );
};

export default InlineCalendar;

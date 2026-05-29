import React, { useState, useEffect } from 'react';
import { fetchCalendarEvents } from '../api';
import { Typography, IconButton, Button, Tooltip } from '@mui/material';
import ArrowBackIosNewIcon from '@mui/icons-material/ArrowBackIosNew';
import ArrowForwardIosIcon from '@mui/icons-material/ArrowForwardIos';
import { format, addMonths, subMonths, startOfMonth, endOfMonth, eachDayOfInterval, isSameMonth, isSameDay, getDay, isToday } from 'date-fns';

const InlineCalendar = ({ environmentId }) => {
  const [currentDate, setCurrentDate] = useState(new Date());
  const [events, setEvents] = useState([]);
  
  useEffect(() => {
    const loadEvents = async () => {
      if (!environmentId) return;
      try {
        const res = await fetchCalendarEvents(environmentId, currentDate.getMonth() + 1, currentDate.getFullYear());
        setEvents(res.data);
      } catch (err) {
        console.error(err);
      }
    };
    loadEvents();
  }, [environmentId, currentDate]);

  const [view, setView] = useState('month');

  const handlePrev = () => setCurrentDate(prev => view === 'month' ? subMonths(prev, 1) : addMonths(prev, -12));
  const handleNext = () => setCurrentDate(prev => view === 'month' ? addMonths(prev, 1) : addMonths(prev, 12));
  const handleToday = () => setCurrentDate(new Date());

  const monthStart = startOfMonth(currentDate);
  const monthEnd = endOfMonth(monthStart);
  const days = eachDayOfInterval({ start: monthStart, end: monthEnd });
  
  const startDay = getDay(monthStart);

  const getEventsForDay = (day) => {
    return events.filter(e => {
      const eDate = new Date(e.due_date);
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

  return (
    <div className="bg-[#FAFAFA] border-l border-gray-200 h-full p-6 flex flex-col">
      <div className="flex justify-between items-center mb-6">
        <Typography variant="h6" className="font-bold text-gray-800">
          {format(currentDate, view === 'month' ? 'MMMM yyyy' : 'yyyy')}
        </Typography>
        <div className="flex gap-1 items-center">
          <div className="bg-gray-200 rounded p-0.5 mr-2 flex">
            <button className={`text-xs px-2 py-0.5 rounded ${view === 'month' ? 'bg-white shadow-sm' : ''}`} onClick={() => setView('month')}>Month</button>
            <button className={`text-xs px-2 py-0.5 rounded ${view === 'year' ? 'bg-white shadow-sm' : ''}`} onClick={() => setView('year')}>Year</button>
          </div>
          <Button size="small" onClick={handleToday} className="text-gray-600! min-w-0! px-3!">Today</Button>
          <IconButton size="small" onClick={handlePrev}><ArrowBackIosNewIcon fontSize="inherit" /></IconButton>
          <IconButton size="small" onClick={handleNext}><ArrowForwardIosIcon fontSize="inherit" /></IconButton>
        </div>
      </div>
      
      {view === 'month' ? (
        <>
          <div className="grid grid-cols-7 gap-1 mb-2">
            {['Su', 'Mo', 'Tu', 'We', 'Th', 'Fr', 'Sa'].map(d => (
              <div key={d} className="text-center text-xs font-bold text-gray-400 py-2">{d}</div>
            ))}
          </div>
          
          <div className="grid grid-cols-7 gap-1 flex-1">
            {Array.from({ length: startDay }).map((_, i) => (
              <div key={`empty-${i}`} className="bg-transparent" />
            ))}
            {days.map(day => {
              const dayEvents = getEventsForDay(day);
              const isCurrToday = isToday(day);
              return (
                <div key={day.toString()} className={`bg-white border ${isCurrToday ? 'border-[#00A651]' : 'border-gray-100'} p-1 min-h-[80px] flex flex-col`}>
                  <div className={`text-xs font-bold ${isCurrToday ? 'text-[#00A651]' : 'text-gray-500'} mb-1 ml-1`}>
                    {format(day, 'd')}
                  </div>
                  <div className="flex flex-col gap-1 overflow-y-auto flex-1">
                    {dayEvents.map((ev, i) => (
                      <Tooltip key={i} title={ev.equipment_name} placement="top">
                        <div className={`text-[10px] text-white px-1 py-0.5 rounded-sm truncate cursor-default ${getStatusColor(ev.status)}`}>
                          {ev.equipment_name}
                        </div>
                      </Tooltip>
                    ))}
                  </div>
                </div>
              );
            })}
          </div>
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

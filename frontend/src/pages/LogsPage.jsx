import React, { useState, useEffect, useCallback } from 'react';
import { fetchLogs, fetchEnvironments } from '../api';
import { Typography, Paper, Table, TableBody, TableCell, TableContainer, TableHead, TableRow, Select, MenuItem, TextField, Button } from '@mui/material';
import { format } from 'date-fns';
import DescriptionIcon from '@mui/icons-material/Description';

const LogsPage = () => {
  const [logs, setLogs] = useState([]);
  const [environments, setEnvironments] = useState([]);
  const [envFilter, setEnvFilter] = useState('all');
  const [fromDate, setFromDate] = useState('');
  const [toDate, setToDate] = useState('');

  const loadData = useCallback(async () => {
    try {
      const envRes = await fetchEnvironments();
      setEnvironments(envRes.data);
      
      const logRes = await fetchLogs({ 
        environment_id: envFilter === 'all' ? '' : envFilter,
        from_date: fromDate,
        to_date: toDate
      });
      setLogs(logRes.data);
    } catch (err) {
      console.error(err);
    }
  }, [envFilter, fromDate, toDate]);

  useEffect(() => {
    loadData();
  }, [loadData]);

  return (
    <div className="h-full flex flex-col overflow-hidden space-y-6">
      <div className="shrink-0 bg-white p-6 border border-gray-100 shadow-sm flex flex-wrap gap-4 items-center">
        <Typography variant="h5" className="text-[#00A651] font-bold mr-auto">Global Maintenance Logs</Typography>
        
        <Select
          size="small"
          value={envFilter}
          onChange={(e) => setEnvFilter(e.target.value)}
          className="min-w-[200px]"
        >
          <MenuItem value="all">All Environments</MenuItem>
          {environments.map(env => (
            <MenuItem key={env.id} value={env.id}>{env.name}</MenuItem>
          ))}
        </Select>

        <TextField
          type="date"
          size="small"
          label="From Date"
          InputLabelProps={{ shrink: true }}
          value={fromDate}
          onChange={(e) => setFromDate(e.target.value)}
        />
        <TextField
          type="date"
          size="small"
          label="To Date"
          InputLabelProps={{ shrink: true }}
          value={toDate}
          onChange={(e) => setToDate(e.target.value)}
        />
      </div>

      <TableContainer component={Paper} elevation={0} className="flex-1 overflow-y-auto border border-gray-100 rounded-none shadow-sm">
        <Table stickyHeader>
          <TableHead className="bg-gray-50/80">
            <TableRow>
              <TableCell className="font-bold! text-[#64748b]!">EQUIPMENT</TableCell>
              <TableCell className="font-bold! text-[#64748b]!">ENVIRONMENT</TableCell>
              <TableCell className="font-bold! text-[#64748b]!">COMPLETION DATE</TableCell>
              <TableCell className="font-bold! text-[#64748b]!">PERSON</TableCell>
              <TableCell className="font-bold! text-[#64748b]!">DESCRIPTION</TableCell>
              <TableCell className="font-bold! text-[#64748b]!">DOCUMENT</TableCell>
            </TableRow>
          </TableHead>
          <TableBody>
            {logs.map(log => (
              <TableRow key={log.id} hover>
                <TableCell className="font-bold! text-gray-900!">{log.equipment_name}</TableCell>
                <TableCell>{log.environment_name}</TableCell>
                <TableCell>{format(new Date(log.completion_date), 'MMM dd, yyyy')}</TableCell>
                <TableCell>{log.person || '-'}</TableCell>
                <TableCell className="truncate max-w-[200px]">{log.description || '-'}</TableCell>
                <TableCell>
                  {log.document_paths && log.document_paths.length > 0 ? (
                    log.document_paths.map((p, i) => (
                      <Button key={i} size="small" href={`http://127.0.0.1:5000/${p.replace(/\\/g, '/')}`} target="_blank" download startIcon={<DescriptionIcon />}>
                        DL
                      </Button>
                    ))
                  ) : '-'}
                </TableCell>
              </TableRow>
            ))}
            {logs.length === 0 && (
              <TableRow>
                <TableCell colSpan={6} align="center" className="py-10 text-gray-500">No logs found.</TableCell>
              </TableRow>
            )}
          </TableBody>
        </Table>
      </TableContainer>
    </div>
  );
};

export default LogsPage;

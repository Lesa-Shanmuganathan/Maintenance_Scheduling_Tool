import React, { useState, useRef } from 'react';
import { Dialog, Typography, Button, CircularProgress, IconButton, LinearProgress, Box } from '@mui/material';
import CloseIcon from '@mui/icons-material/Close';
import CloudUploadIcon from '@mui/icons-material/CloudUpload';
import { uploadDocument, fetchTaskProgress } from '../api';

const ImportDocumentModal = ({ isOpen, onClose, onSuccess }) => {
  const [file, setFile] = useState(null);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState('');
  
  const [taskStatus, setTaskStatus] = useState(null);
  const pollInterval = useRef(null);

  const cleanup = () => {
    if (pollInterval.current) {
      clearInterval(pollInterval.current);
      pollInterval.current = null;
    }
    setTaskStatus(null);
    setLoading(false);
    setFile(null);
    setError('');
  };

  const handleClose = () => {
    if (!loading) {
      cleanup();
      onClose();
    }
  };

  const handleFileChange = (e) => {
    if (e.target.files && e.target.files[0]) {
      setFile(e.target.files[0]);
      setError('');
    }
  };

  const startPolling = (taskId) => {
    pollInterval.current = setInterval(async () => {
      try {
        const res = await fetchTaskProgress(taskId);
        const data = res.data;
        
        setTaskStatus(data);
        
        if (data.status === 'completed') {
          clearInterval(pollInterval.current);
          onSuccess(data.results);
          cleanup();
        } else if (data.status === 'error') {
          clearInterval(pollInterval.current);
          setError('Classification failed: ' + data.error);
          setLoading(false);
        }
      } catch (err) {
        clearInterval(pollInterval.current);
        setError('Lost connection to server while checking progress.');
        setLoading(false);
      }
    }, 1000); // Check every 1 second
  };

  const handleUpload = async () => {
    if (!file) {
      setError('Please select a file to upload.');
      return;
    }
    setLoading(true);
    setError('');
    setTaskStatus({ status: 'uploading', progress: 0, total: 0 });

    const formData = new FormData();
    formData.append('file', file);

    try {
      const response = await uploadDocument(formData);
      if (response.data.task_id) {
        setTaskStatus({ status: 'processing', progress: 0, total: 1, current_item: 'Initializing...' });
        startPolling(response.data.task_id);
      } else {
        // Fallback for immediate synchronous returns
        onSuccess(response.data);
        cleanup();
      }
    } catch (err) {
      setError(err.response?.data?.error || 'Failed to process document.');
      setLoading(false);
      setTaskStatus(null);
    }
  };

  // Calculate percentage
  const progressPercent = taskStatus && taskStatus.total > 0 
    ? Math.round((taskStatus.progress / taskStatus.total) * 100) 
    : 0;

  return (
    <Dialog open={isOpen} onClose={loading ? undefined : handleClose} maxWidth="sm" fullWidth PaperProps={{ className: 'p-6 rounded-none' }}>
      <div className="flex justify-between items-center mb-4 border-b border-gray-100 pb-2">
        <Typography variant="h6" className="font-bold text-[#00A651]">Import from Document</Typography>
        {!loading && (
          <IconButton onClick={handleClose} size="small">
            <CloseIcon />
          </IconButton>
        )}
      </div>

      <div className="flex flex-col gap-4">
        <Typography className="text-gray-600 text-sm">
          Upload a PDF, Excel, Word, or CSV file containing a list of equipment. The AI will analyze and classify each system into the correct environment.
        </Typography>

        {!loading ? (
          <div className="border-2 border-dashed border-gray-300 p-8 flex flex-col items-center justify-center bg-gray-50/50">
            <input
              accept=".pdf,.xlsx,.xls,.docx,.csv"
              style={{ display: 'none' }}
              id="raised-button-file"
              type="file"
              onChange={handleFileChange}
              disabled={loading}
            />
            <label htmlFor="raised-button-file" className="flex flex-col items-center cursor-pointer">
              <CloudUploadIcon className="text-gray-400 mb-2" style={{ fontSize: 48 }} />
              <Button variant="outlined" component="span" disabled={loading} className="normal-case rounded-none border-gray-300 text-gray-700 font-semibold mb-2">
                Choose File
              </Button>
              {file && <Typography className="text-[#00A651] font-bold text-sm mt-2">{file.name}</Typography>}
            </label>
          </div>
        ) : (
          <div className="flex flex-col gap-4 p-8 items-center bg-gray-50/50 border border-gray-100">
            {taskStatus?.status === 'uploading' ? (
              <>
                <CircularProgress size={40} className="text-[#00A651]!" />
                <Typography className="font-bold text-gray-700 mt-2">Uploading file and parsing tables...</Typography>
              </>
            ) : (
              <>
                <Typography className="font-bold text-gray-800 text-lg">AI Classification in Progress</Typography>
                <Box sx={{ width: '100%', mr: 1 }}>
                  <LinearProgress variant="determinate" value={progressPercent} className="h-3! rounded-none! bg-gray-200!" sx={{ '& .MuiLinearProgress-bar': { backgroundColor: '#00A651' } }} />
                </Box>
                <div className="flex justify-between w-full mt-1">
                  <Typography className="text-xs font-bold text-gray-500 uppercase">{progressPercent}% Completed</Typography>
                  <Typography className="text-xs font-bold text-gray-500">{taskStatus?.progress || 0} / {taskStatus?.total || 0} Systems</Typography>
                </div>
                {taskStatus?.current_item && (
                  <Typography className="text-sm text-gray-600 mt-2 truncate max-w-full italic">
                    <span className="font-semibold not-italic">Currently analyzing:</span> {taskStatus.current_item}
                  </Typography>
                )}
              </>
            )}
          </div>
        )}

        {error && (
          <Typography className="text-red-600 font-semibold bg-red-50 p-3 text-sm border border-red-100">
            {error}
          </Typography>
        )}

        <div className="flex justify-end mt-2">
          {!loading && (
            <Button
              variant="contained"
              onClick={handleUpload}
              disabled={!file}
              className="bg-black! text-white! font-bold py-2.5 px-6 rounded-none normal-case hover:bg-gray-800!"
            >
              Upload & Classify
            </Button>
          )}
        </div>
      </div>
    </Dialog>
  );
};

export default ImportDocumentModal;

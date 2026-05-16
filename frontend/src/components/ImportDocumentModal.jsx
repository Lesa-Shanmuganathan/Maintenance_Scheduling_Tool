import React, { useState } from 'react';
import { Dialog, Typography, Button, CircularProgress, IconButton } from '@mui/material';
import CloseIcon from '@mui/icons-material/Close';
import CloudUploadIcon from '@mui/icons-material/CloudUpload';
import { uploadDocument } from '../api';

const ImportDocumentModal = ({ isOpen, onClose, onSuccess }) => {
  const [file, setFile] = useState(null);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState('');

  const handleFileChange = (e) => {
    if (e.target.files && e.target.files[0]) {
      setFile(e.target.files[0]);
      setError('');
    }
  };

  const handleUpload = async () => {
    if (!file) {
      setError('Please select a file to upload.');
      return;
    }
    setLoading(true);
    setError('');

    const formData = new FormData();
    formData.append('file', file);

    try {
      const response = await uploadDocument(formData);
      onSuccess(response.data);
    } catch (err) {
      setError(err.response?.data?.error || 'Failed to process document.');
    } finally {
      setLoading(false);
    }
  };

  return (
    <Dialog open={isOpen} onClose={loading ? undefined : onClose} maxWidth="sm" fullWidth PaperProps={{ className: 'p-6 rounded-none' }}>
      <div className="flex justify-between items-center mb-4 border-b border-gray-100 pb-2">
        <Typography variant="h6" className="font-bold text-[#00A651]">Import from Document</Typography>
        {!loading && (
          <IconButton onClick={onClose} size="small">
            <CloseIcon />
          </IconButton>
        )}
      </div>

      <div className="flex flex-col gap-4">
        <Typography className="text-gray-600 text-sm">
          Upload a PDF, Excel, Word, or CSV file containing a list of equipment. The AI will analyze and classify each system into the correct environment.
        </Typography>

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

        {error && (
          <Typography className="text-red-600 font-semibold bg-red-50 p-3 text-sm border border-red-100">
            {error}
          </Typography>
        )}

        <div className="flex justify-end mt-2">
          <Button
            variant="contained"
            onClick={handleUpload}
            disabled={!file || loading}
            className="bg-black! text-white! font-bold py-2.5 px-6 rounded-none normal-case hover:bg-gray-800!"
          >
            {loading ? <CircularProgress size={24} className="text-white!" /> : 'Upload & Classify'}
          </Button>
        </div>
      </div>
    </Dialog>
  );
};

export default ImportDocumentModal;

import React, { useState, useEffect, useCallback } from 'react';
import VerificationTable from '../components/VerificationTable';
import { fetchPendingReview } from '../api';

const PendingReviewPage = ({ onCountChange }) => {
  const [pendingItems, setPendingItems] = useState([]);

  const loadPendingItems = useCallback(async () => {
    try {
      const res = await fetchPendingReview();
      setPendingItems(res.data);
      if (onCountChange) {
        onCountChange(res.data.length);
      }
    } catch (err) {
      console.error(err);
    }
  }, [onCountChange]);

  useEffect(() => {
    loadPendingItems();
  }, [loadPendingItems]);

  return (
    <VerificationTable 
      systems={pendingItems} 
      isPendingTab={true}
      onActionSuccess={loadPendingItems}
    />
  );
};

export default PendingReviewPage;

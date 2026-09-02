import React from 'react';
import { CircularProgress, Box, Typography } from '@mui/material';

const PageLoading = () => {
  return (
    <Box
      sx={{
        display: 'flex',
        flexDirection: 'column',
        justifyContent: 'center',
        alignItems: 'center',
        height: '100vh',
        width: '100vw',
        position: 'fixed',
        top: 0,
        left: 0,
        bgcolor: 'background.default',
        zIndex: 9999
      }}
    >
      <CircularProgress size={60} thickness={4} color="primary" />
      <Typography variant="h6" sx={{ mt: 2, color: 'text.secondary', fontWeight: 500 }}>
        Cargando Spectra...
      </Typography>
    </Box>
  );
};

export default PageLoading;

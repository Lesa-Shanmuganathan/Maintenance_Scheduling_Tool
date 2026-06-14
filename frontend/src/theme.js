import { createTheme } from '@mui/material/styles';

// AVL Design System Theme
// Primary: Dark Blue (#005A99) | Accent: Turquoise (#00A4C7)
// Font: Inter | Corners: 8px inputs/buttons, 12px cards
const theme = createTheme({
  palette: {
    primary: {
      main: '#005A99',      // AVL Dark Blue
      light: '#00A4C7',     // Turquoise
      dark: '#004478',
      contrastText: '#ffffff',
    },
    secondary: {
      main: '#00A4C7',      // Turquoise
      dark: '#028550',      // Dark Green
      contrastText: '#ffffff',
    },
    error: {
      main: '#ef4444',
    },
    background: {
      default: '#f0f4f8',
      paper: '#ffffff',
    },
    text: {
      primary: '#1e293b',
      secondary: '#64748b',
    },
    divider: 'rgba(0, 90, 153, 0.12)',
  },
  typography: {
    fontFamily: "'Inter', 'Segoe UI', Roboto, Helvetica, Arial, sans-serif",
    h4: { fontWeight: 700 },
    h5: { fontWeight: 700 },
    h6: { fontWeight: 600 },
    subtitle1: { fontWeight: 600 },
    subtitle2: { fontWeight: 600 },
    button: {
      textTransform: 'none',
      fontWeight: 600,
      fontSize: '0.9375rem',
    },
  },
  shape: {
    borderRadius: 8,
  },
  components: {
    MuiButton: {
      styleOverrides: {
        root: {
          borderRadius: 8,
          transition: 'all 0.2s ease',
          '&:active': { transform: 'translateY(0)' },
        },
        containedPrimary: {
          background: 'linear-gradient(135deg, #005A99, #00A4C7)',
          boxShadow: '0 4px 15px rgba(0, 90, 153, 0.25)',
          '&:hover': {
            background: 'linear-gradient(135deg, #00A4C7, #028550)',
            boxShadow: '0 6px 20px rgba(0, 164, 199, 0.3)',
            transform: 'translateY(-2px)',
          },
          '&:disabled': {
            opacity: 0.6,
            cursor: 'not-allowed',
            transform: 'none',
          },
        },
        outlinedPrimary: {
          borderColor: '#005A99',
          color: '#005A99',
          '&:hover': {
            background: 'rgba(0, 90, 153, 0.06)',
            borderColor: '#00A4C7',
          },
        },
      },
    },
    MuiCard: {
      styleOverrides: {
        root: {
          borderRadius: 12,
          border: '1px solid rgba(0, 90, 153, 0.12)',
          boxShadow: '0 1px 3px rgba(0,0,0,0.06), 0 4px 12px rgba(0,90,153,0.04)',
          transition: 'all 0.2s ease',
          '&:hover': {
            boxShadow: '0 4px 16px rgba(0, 90, 153, 0.08)',
            borderColor: 'rgba(0, 90, 153, 0.18)',
          },
        },
      },
    },
    MuiPaper: {
      styleOverrides: {
        root: {
          borderRadius: 12,
        },
        elevation1: {
          boxShadow: '0 1px 3px rgba(0,0,0,0.06), 0 4px 12px rgba(0,90,153,0.04)',
        },
      },
    },
    MuiOutlinedInput: {
      styleOverrides: {
        root: {
          borderRadius: 8,
          backgroundColor: '#f8fafc',
          '& .MuiOutlinedInput-notchedOutline': {
            borderColor: '#e2e8f0',
            borderWidth: '1.5px',
          },
          '&:hover .MuiOutlinedInput-notchedOutline': {
            borderColor: '#00A4C7',
          },
        },
      },
    },
    MuiInputBase: {
      styleOverrides: {
        root: {
          borderRadius: 8,
        },
      },
    },
    MuiDialog: {
      styleOverrides: {
        paper: {
          borderRadius: 12,
          boxShadow: '0 10px 40px rgba(0,0,0,0.12), 0 4px 12px rgba(0,0,0,0.06)',
        },
      },
    },
    MuiChip: {
      styleOverrides: {
        root: {
          borderRadius: 20,
          fontWeight: 600,
        },
      },
    },
    MuiTableHead: {
      styleOverrides: {
        root: {
          '& .MuiTableCell-head': {
            backgroundColor: '#f8fafc',
            color: '#64748b',
            fontWeight: 700,
            fontSize: '0.75rem',
            letterSpacing: '0.05em',
            textTransform: 'uppercase',
            borderBottom: '1.5px solid rgba(0, 90, 153, 0.12)',
          },
        },
      },
    },
    MuiTableRow: {
      styleOverrides: {
        root: {
          '&.MuiTableRow-hover:hover': {
            backgroundColor: 'rgba(0, 90, 153, 0.03)',
          },
        },
      },
    },
    MuiTab: {
      styleOverrides: {
        root: {
          fontWeight: 600,
          fontSize: '0.875rem',
          textTransform: 'none',
          minHeight: 48,
          color: '#64748b',
          '&.Mui-selected': {
            color: '#005A99',
          },
        },
      },
    },
    MuiTabs: {
      styleOverrides: {
        indicator: {
          backgroundColor: '#005A99',
          height: 3,
          borderRadius: '3px 3px 0 0',
        },
      },
    },
    MuiSelect: {
      styleOverrides: {
        root: {
          borderRadius: 8,
        },
      },
    },
    MuiPopover: {
      styleOverrides: {
        paper: {
          borderRadius: 12,
          boxShadow: '0 10px 40px rgba(0,0,0,0.12), 0 4px 12px rgba(0,0,0,0.06)',
        },
      },
    },
    MuiTooltip: {
      styleOverrides: {
        tooltip: {
          backgroundColor: '#1e293b',
          fontSize: '0.75rem',
          borderRadius: 6,
        },
      },
    },
  },
});


export default theme;

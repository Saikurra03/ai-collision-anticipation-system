/** @type {import('tailwindcss').Config} */
export default {
  content: ['./index.html', './src/**/*.{js,ts,jsx,tsx}'],
  theme: {
    extend: {
      fontFamily: {
        sans: ['Inter', 'system-ui', 'sans-serif'],
      },
      colors: {
        surface: {
          DEFAULT: '#FFFFFF',
          hover: '#F9FAFB',
        },
        text: {
          primary: '#1C232B',
          secondary: '#667085',
          muted: '#98A2B3',
        },
        brand: {
          DEFAULT: '#2563EB',
          hover: '#1D4ED8',
        },
        accent: {
          DEFAULT: '#2563EB',
          hover: '#1D4ED8',
        },
        ink: {
          DEFAULT: '#111827',
          50: '#F8FAFC',
          100: '#F1F5F9',
          200: '#E2E8F0',
          300: '#CBD5E1',
          400: '#94A3B8',
          500: '#64748B',
          600: '#475569',
          700: '#334155',
          800: '#1E293B',
          900: '#0F172A',
          950: '#020617',
        },
        success: {
          DEFAULT: '#16A34A',
          bg: '#ECFDF5',
          text: '#065F46',
        },
        warning: {
          DEFAULT: '#F59E0B',
          bg: '#FFFAEB',
          text: '#854D0E',
        },
        danger: {
          DEFAULT: '#DC2626',
          bg: '#FEF2F2',
          text: '#991B1B',
        },
        border: {
          DEFAULT: '#E4E7EC',
          light: '#F2F4F7',
        },
        bg: {
          DEFAULT: '#F6F7F9',
          card: '#FFFFFF',
        },
      },
      spacing: {
        '18': '4.5rem',
      },
      boxShadow: {
        'card': '0 1px 2px rgba(16, 24, 40, 0.05), 0 1px 3px rgba(16, 24, 40, 0.05)',
        'card-hover': '0 4px 8px rgba(16, 24, 40, 0.08), 0 2px 4px rgba(16, 24, 40, 0.06)',
        'glow': '0 0 15px rgba(37, 99, 235, 0.3)',
      },
      borderRadius: {
        'card': '12px',
        'pill': '9999px',
      },
    },
  },
  plugins: [],
};
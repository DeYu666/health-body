/** @type {import('tailwindcss').Config} */
export default {
  content: ['./index.html', './src/**/*.{js,ts,jsx,tsx}'],
  theme: {
    extend: {
      colors: {
        primary: {
          DEFAULT: '#3b82f6',
          dark: '#2563eb',
        },
        secondary: '#10b981',
        danger: '#ef4444',
        surface: '#f9fafb',
        accent: {
          lavender: '#667eea',
          purple: '#764ba2',
        },
      },
      fontFamily: {
        display: ['"SF Pro Display"', 'PingFang SC', 'Hiragino Sans GB', '"Microsoft YaHei"', 'system-ui', 'sans-serif'],
        body: ['"SF Pro Text"', 'PingFang SC', 'Hiragino Sans GB', '"Microsoft YaHei"', 'system-ui', 'sans-serif'],
      },
      boxShadow: {
        card: '0 4px 6px -1px rgba(0, 0, 0, 0.1), 0 2px 4px -1px rgba(0, 0, 0, 0.06)',
        'card-hover': '0 10px 15px -3px rgba(0, 0, 0, 0.1), 0 4px 6px -2px rgba(0, 0, 0, 0.05)',
      },
      borderRadius: {
        xl: '22px',
      },
      backgroundImage: {
        'gradient-hero': 'linear-gradient(135deg, #667eea 0%, #764ba2 100%)',
      },
    },
  },
  plugins: [require('@tailwindcss/forms')],
}


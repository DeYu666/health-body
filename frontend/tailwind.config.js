/** @type {import('tailwindcss').Config} */
export default {
  content: ['./index.html', './src/**/*.{js,ts,jsx,tsx}'],
  theme: {
    extend: {
      colors: {
        primary: {
          DEFAULT: '#087F8C',
          dark: '#066A74',
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
        card: '0 1px 2px rgba(15, 23, 42, 0.06)',
        'card-hover': '0 8px 24px rgba(15, 23, 42, 0.08)',
      },
      borderRadius: {
        xl: '8px',
      },
      backgroundImage: {
        'gradient-hero': 'linear-gradient(180deg, #f8fafc 0%, #eef7f7 48%, #f8fafc 100%)',
      },
    },
  },
  plugins: [require('@tailwindcss/forms')],
}

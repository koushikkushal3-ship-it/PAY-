/** @type {import('tailwindcss').Config} */
export default {
  content: ['./index.html', './src/**/*.{js,jsx}'],
  theme: {
    extend: {
      colors: {
        ink:   { 900: '#0b0e14', 800: '#11151d', 700: '#171c26', 600: '#1f2632', 500: '#2b3340' },
        mute:  { 400: '#8b95a7', 300: '#a9b2c1' },
        risk:  { danger: '#f4635e', warn: '#e0a33e', ok: '#4bb98a', info: '#5b9bf0' },
        brand: '#3b82f6',
      },
      fontFamily: {
        sans: ['Inter', 'system-ui', 'sans-serif'],
        mono: ['ui-monospace', 'SFMono-Regular', 'Menlo', 'monospace'],
      },
    },
  },
  plugins: [],
};

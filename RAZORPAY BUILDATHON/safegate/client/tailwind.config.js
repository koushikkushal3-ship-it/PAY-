/** @type {import('tailwindcss').Config} */
export default {
  content: ['./index.html', './src/**/*.{js,jsx}'],
  theme: {
    extend: {
      colors: {
        ink: '#0b1020',
        panel: '#131a2e',
        edge: '#233049',
        muted: '#8ea0c4',
      },
    },
  },
  plugins: [],
};

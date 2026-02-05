/** @type {import('tailwindcss').Config} */
export default {
  content: [
    "./index.html",
    "./src/**/*.{js,ts,jsx,tsx}",
  ],
  darkMode: 'class',
  theme: {
    extend: {
      colors: {
        // Status colors
        'status-running': '#3b82f6',
        'status-succeeded': '#22c55e',
        'status-failed': '#ef4444',
        'status-archived': '#6b7280',
        'status-pending': '#eab308',
        // Phase colors
        'phase-completed': '#22c55e',
        'phase-current': '#3b82f6',
        'phase-pending': '#374151',
        'phase-missing': '#991b1b',
        'phase-unknown': '#9333ea',
      },
    },
  },
  plugins: [],
}

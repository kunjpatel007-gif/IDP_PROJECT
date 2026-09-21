import React from 'react';
import ReactDOM from 'react-dom/client';
import App from '@/App';
import SmoothScroll from '@/components/SmoothScroll';
import { ToastProvider } from '@/components/ToastNotification';
import '@/styles/globals.css';

ReactDOM.createRoot(document.getElementById('root')).render(
  <React.StrictMode>
    <SmoothScroll>
      <ToastProvider>
        <App />
      </ToastProvider>
    </SmoothScroll>
  </React.StrictMode>
);

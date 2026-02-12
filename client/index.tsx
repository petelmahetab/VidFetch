
import React from 'react';
import ReactDOM from 'react-dom/client';
import App from './App.tsx'; 
import { ClerkProvider } from '@clerk/clerk-react';
import { BrowserRouter } from 'react-router-dom';

const PUBLISHABLE_KEY = import.meta.env.VITE_CLERK_PUBLISHABLE_KEY;

if (!PUBLISHABLE_KEY) {
  throw new Error(
    'Missing Clerk Publishable Key!\n' +
    'Add this line to your .env.local (or .env) file:\n' +
    'VITE_CLERK_PUBLISHABLE_KEY=pk_test_YourKeyHere...\n' +
    '(Get it from Clerk Dashboard → API Keys → Publishable Key)'
  );
}


const rootElement = document.getElementById('root');

if (!rootElement) {
  throw new Error("Could not find root element to mount to (#root in index.html)");
}

ReactDOM.createRoot(document.getElementById('root')!).render(
  <React.StrictMode>
    <ClerkProvider publishableKey={PUBLISHABLE_KEY}>
      <BrowserRouter>
        <App />
      </BrowserRouter>
    </ClerkProvider>
  </React.StrictMode>
);

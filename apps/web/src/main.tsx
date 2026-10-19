import { createRoot } from 'react-dom/client';
import { ThemeProvider } from '@cognirise/atelier/layout';
import { AppState } from './app/state';
import App from './App';
import './index.css';

createRoot(document.getElementById('root')!).render(
  <ThemeProvider>
    <AppState>
      <App />
    </AppState>
  </ThemeProvider>,
);

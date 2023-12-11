import '@fontsource/roboto/300.css';
import '@fontsource/roboto/400.css';
import '@fontsource/roboto/500.css';
import '@fontsource/roboto/700.css';
import {createTheme, CssBaseline} from '@mui/material';
import {ThemeProvider} from '@mui/material/styles';
import {StrictMode} from 'react';
import {createRoot} from 'react-dom/client';
import App from './App';

const theme = createTheme();
const container = document.getElementById('root');

if (!container) {
    throw new Error('Root element missing');
}

const root = createRoot(container);
root.render((
    <StrictMode>
        <ThemeProvider theme={theme}>
            <CssBaseline/>
            <App/>
        </ThemeProvider>
    </StrictMode>
));

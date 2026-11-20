import { defineConfig } from 'vite';
import react from '@vitejs/plugin-react';

// The dev server would answer /tutorial with the app itself; serve the
// static tutorial page there instead, as production does.
const tutorialPage = {
    name: 'tutorial-page',
    configureServer(server) {
        server.middlewares.use((req, res, next) => {
            if (req.url === '/tutorial') {
                res.writeHead(301, { Location: '/tutorial/' });
                return res.end();
            }
            if (req.url === '/tutorial/') req.url = '/tutorial/index.html';
            next();
        });
    },
};

// https://vitejs.dev/config/
export default defineConfig({
    plugins: [react(), tutorialPage],
});

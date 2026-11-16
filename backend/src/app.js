const path = require('path');
const express = require('express');
const { HttpError, errorHandler } = require('./errors');
const { authenticate, requireUser, sameOriginOnly } = require('./auth');
const { uploadErrorHandler } = require('./uploads');

function createApp() {
    const app = express();
    app.set('trust proxy', 1);
    app.use(express.json());

    app.use('/api', sameOriginOnly, authenticate);
    app.use('/api/auth', require('./routes/auth'));
    app.use('/api/users', require('./routes/users'));
    app.use('/api/projects', requireUser, require('./routes/projects'));
    app.use('/api/tasks', requireUser, require('./routes/tasks'));
    app.use('/api/attachments', requireUser, require('./routes/attachments'));
    app.use('/api/activity', requireUser, require('./routes/activity'));
    app.use('/api/stats', requireUser, require('./routes/stats'));
    app.use('/api', () => {
        throw new HttpError(404, 'Not found.');
    });

    // In production the built React app is served from ./static; any other
    // GET falls through to index.html so client-side routes like /tasks/3
    // work on refresh.
    const staticDir = path.join(__dirname, 'static');
    app.use(express.static(staticDir));
    app.use((req, res, next) => {
        if (req.method !== 'GET') return next();
        res.sendFile(path.join(staticDir, 'index.html'), (err) => {
            if (err) next();
        });
    });

    app.use(uploadErrorHandler);
    app.use(errorHandler);
    return app;
}

module.exports = { createApp };

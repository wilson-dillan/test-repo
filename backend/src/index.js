const db = require('./db');
const { ensureSuperuser } = require('./auth');
const { createApp } = require('./app');

const PORT = process.env.PORT || 3000;

db.init()
    .then(ensureSuperuser)
    .then(() => {
        createApp().listen(PORT, () =>
            console.log(`Listening on port ${PORT}`),
        );
    })
    .catch((err) => {
        console.error(err);
        process.exit(1);
    });

const gracefulShutdown = () => {
    db.teardown()
        .catch(() => {})
        .then(() => process.exit());
};

process.on('SIGINT', gracefulShutdown);
process.on('SIGTERM', gracefulShutdown);
process.on('SIGUSR2', gracefulShutdown); // Sent by nodemon

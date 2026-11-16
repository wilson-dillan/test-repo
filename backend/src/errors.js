class HttpError extends Error {
    constructor(status, message) {
        super(message);
        this.status = status;
    }
}

function errorHandler(err, req, res, next) {
    if (err instanceof HttpError) {
        return res.status(err.status).send({ error: err.message });
    }
    // Malformed JSON bodies from express.json()
    if (err.type === 'entity.parse.failed') {
        return res.status(400).send({ error: 'Invalid request body.' });
    }
    console.error(err);
    res.status(500).send({ error: 'Something went wrong. Please try again.' });
}

module.exports = { HttpError, errorHandler };

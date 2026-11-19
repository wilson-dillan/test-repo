class HttpError extends Error {
    // `details` are extra fields sent alongside the error message.
    constructor(status, message, details) {
        super(message);
        this.status = status;
        this.details = details;
    }
}

// The numeric :id from a route, or a 404 naming what wasn't found.
function routeId(req, what) {
    const id = Number(req.params.id);
    if (!Number.isInteger(id)) throw new HttpError(404, `${what} not found.`);
    return id;
}

function errorHandler(err, req, res, next) {
    if (err instanceof HttpError) {
        return res
            .status(err.status)
            .send({ error: err.message, ...err.details });
    }
    // Malformed JSON bodies from express.json()
    if (err.type === 'entity.parse.failed') {
        return res.status(400).send({ error: 'Invalid request body.' });
    }
    console.error(err);
    res.status(500).send({ error: 'Something went wrong. Please try again.' });
}

module.exports = { HttpError, errorHandler, routeId };

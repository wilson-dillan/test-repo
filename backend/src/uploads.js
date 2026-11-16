const path = require('path');
const multer = require('multer');

const MAX_FILE_SIZE = 10 * 1024 * 1024;
const MAX_FILES = 10;

// Each allowed type must match on MIME type, file extension, and the
// file's leading "magic" bytes, so a renamed file can't slip through.
const ALLOWED_TYPES = {
    'application/pdf': {
        extensions: ['.pdf'],
        signature: Buffer.from('%PDF-'),
    },
    'image/jpeg': {
        extensions: ['.jpg', '.jpeg'],
        signature: Buffer.from([0xff, 0xd8, 0xff]),
    },
};

class UploadError extends Error {}

function hasAllowedType(file) {
    const type = ALLOWED_TYPES[file.mimetype];
    const extension = path.extname(file.originalname).toLowerCase();
    return Boolean(type && type.extensions.includes(extension));
}

function hasValidContents(file) {
    const { signature } = ALLOWED_TYPES[file.mimetype];
    return file.buffer.subarray(0, signature.length).equals(signature);
}

const upload = multer({
    storage: multer.memoryStorage(),
    limits: { fileSize: MAX_FILE_SIZE, files: MAX_FILES },
    fileFilter: (req, file, cb) => {
        if (hasAllowedType(file)) return cb(null, true);
        cb(
            new UploadError(
                `"${file.originalname}" is not allowed. Only PDF and JPEG files are accepted.`,
            ),
        );
    },
}).array('files', MAX_FILES);

const MULTER_MESSAGES = {
    LIMIT_FILE_SIZE: 'Each file must be 10 MB or smaller.',
    LIMIT_FILE_COUNT: `You can attach at most ${MAX_FILES} files.`,
    LIMIT_UNEXPECTED_FILE: `You can attach at most ${MAX_FILES} files.`,
};

function uploadErrorHandler(err, req, res, next) {
    if (err instanceof UploadError) {
        return res.status(400).send({ error: err.message });
    }
    if (err instanceof multer.MulterError) {
        return res
            .status(400)
            .send({ error: MULTER_MESSAGES[err.code] || err.message });
    }
    next(err);
}

module.exports = {
    upload,
    uploadErrorHandler,
    hasValidContents,
    UploadError,
    MAX_FILE_SIZE,
    MAX_FILES,
};

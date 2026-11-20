const path = require('path');
const multer = require('multer');

const MAX_FILE_SIZE = 20 * 1024 * 1024;
const MAX_FILES = 10;

const bytes = (...values) => Buffer.from(values);
const startsWith =
    (...signatures) =>
    (buf) =>
        signatures.some((sig) => buf.subarray(0, sig.length).equals(sig));

const ZIP = startsWith(bytes(0x50, 0x4b, 0x03, 0x04)); // .docx/.xlsx/.pptx
const OLE = startsWith(bytes(0xd0, 0xcf, 0x11, 0xe0, 0xa1, 0xb1, 0x1a, 0xe1)); // .doc/.xls/.ppt
const HEIF_BRANDS = [
    'heic',
    'heix',
    'hevc',
    'hevx',
    'heim',
    'heis',
    'mif1',
    'msf1',
];

// Plain text: no zero bytes near the start (binary files almost always
// have them).
const looksLikeText = (buf) => !buf.subarray(0, 8192).includes(0);

// Allowed file types, by extension: the type the file is stored and served
// as, and a check of its first bytes so a renamed file can't slip through.
// Web pages, SVGs and programs are deliberately not allowed: they can run
// code in a browser or on a computer.
const TYPES = {
    '.pdf': {
        mime: 'application/pdf',
        check: startsWith(Buffer.from('%PDF-')),
    },
    '.jpg': { mime: 'image/jpeg', check: startsWith(bytes(0xff, 0xd8, 0xff)) },
    '.jpeg': { mime: 'image/jpeg', check: startsWith(bytes(0xff, 0xd8, 0xff)) },
    '.png': {
        mime: 'image/png',
        check: startsWith(
            bytes(0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a),
        ),
    },
    '.gif': {
        mime: 'image/gif',
        check: startsWith(Buffer.from('GIF87a'), Buffer.from('GIF89a')),
    },
    '.webp': {
        mime: 'image/webp',
        check: (buf) =>
            buf.subarray(0, 4).toString('latin1') === 'RIFF' &&
            buf.subarray(8, 12).toString('latin1') === 'WEBP',
    },
    '.tif': {
        mime: 'image/tiff',
        check: startsWith(
            bytes(0x49, 0x49, 0x2a, 0x00),
            bytes(0x4d, 0x4d, 0x00, 0x2a),
        ),
    },
    '.heic': {
        mime: 'image/heic',
        check: (buf) =>
            buf.subarray(4, 8).toString('latin1') === 'ftyp' &&
            HEIF_BRANDS.includes(buf.subarray(8, 12).toString('latin1')),
    },
    '.doc': { mime: 'application/msword', check: OLE },
    '.docx': {
        mime: 'application/vnd.openxmlformats-officedocument.wordprocessingml.document',
        check: ZIP,
    },
    '.xls': { mime: 'application/vnd.ms-excel', check: OLE },
    '.xlsx': {
        mime: 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet',
        check: ZIP,
    },
    '.ppt': { mime: 'application/vnd.ms-powerpoint', check: OLE },
    '.pptx': {
        mime: 'application/vnd.openxmlformats-officedocument.presentationml.presentation',
        check: ZIP,
    },
    '.txt': { mime: 'text/plain', check: looksLikeText },
    '.csv': { mime: 'text/csv', check: looksLikeText },
};
TYPES['.tiff'] = TYPES['.tif'];
TYPES['.heif'] = { ...TYPES['.heic'], mime: 'image/heif' };

const ALLOWED_DESCRIPTION =
    'PDFs, photos (JPEG, PNG, HEIC, GIF, WebP, TIFF), Word, Excel, PowerPoint, text or CSV files';

// Types a browser can show in a tab; everything else downloads.
const VIEWABLE = new Set([
    'application/pdf',
    'image/jpeg',
    'image/png',
    'image/gif',
    'image/webp',
    'text/plain',
]);

class UploadError extends Error {}

function typeOf(file) {
    return TYPES[path.extname(file.originalname).toLowerCase()];
}

// The type to store the file as, or null if its contents don't match its
// extension. Browsers report file types inconsistently, so the extension
// and contents decide, not the type the browser sent.
function checkContents(file) {
    const type = typeOf(file);
    return type && type.check(file.buffer) ? type.mime : null;
}

const upload = multer({
    storage: multer.memoryStorage(),
    // File names are UTF-8 (accents, the special space in Mac screenshot
    // names); multer otherwise reads them as Latin-1 and garbles them.
    defParamCharset: 'utf8',
    limits: { fileSize: MAX_FILE_SIZE, files: MAX_FILES },
    fileFilter: (req, file, cb) => {
        if (typeOf(file)) return cb(null, true);
        cb(
            new UploadError(
                `"${file.originalname}" can't be uploaded. Allowed: ${ALLOWED_DESCRIPTION}.`,
            ),
        );
    },
}).array('files', MAX_FILES);

// One optional screenshot with a problem report.
const SCREENSHOT_TYPES = new Set([
    'image/jpeg',
    'image/png',
    'image/gif',
    'image/webp',
]);
const MAX_SCREENSHOT_SIZE = 10 * 1024 * 1024;
const uploadScreenshot = multer({
    storage: multer.memoryStorage(),
    // File names are UTF-8 (accents, the special space in Mac screenshot
    // names); multer otherwise reads them as Latin-1 and garbles them.
    defParamCharset: 'utf8',
    limits: { fileSize: MAX_SCREENSHOT_SIZE, files: 1 },
    fileFilter: (req, file, cb) => {
        if (SCREENSHOT_TYPES.has(typeOf(file)?.mime)) return cb(null, true);
        cb(
            new UploadError(
                'The screenshot must be a PNG, JPEG, GIF or WebP image.',
            ),
        );
    },
}).single('screenshot');

const MULTER_MESSAGES = {
    LIMIT_FILE_SIZE: 'Each file must be 20 MB or smaller.',
    LIMIT_SCREENSHOT_SIZE: 'The screenshot must be 10 MB or smaller.',
    LIMIT_FILE_COUNT: `You can attach at most ${MAX_FILES} files.`,
    LIMIT_UNEXPECTED_FILE: `You can attach at most ${MAX_FILES} files.`,
};

function uploadErrorHandler(err, req, res, next) {
    if (err instanceof UploadError) {
        return res.status(400).send({ error: err.message });
    }
    if (err instanceof multer.MulterError) {
        const code =
            err.code === 'LIMIT_FILE_SIZE' && err.field === 'screenshot'
                ? 'LIMIT_SCREENSHOT_SIZE'
                : err.code;
        return res
            .status(400)
            .send({ error: MULTER_MESSAGES[code] || err.message });
    }
    next(err);
}

module.exports = {
    upload,
    uploadScreenshot,
    uploadErrorHandler,
    checkContents,
    UploadError,
    VIEWABLE,
    MAX_FILE_SIZE,
    MAX_FILES,
};

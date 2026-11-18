import { api } from '../api';

// File types the server accepts (see backend/src/uploads.js).
export const ACCEPTED_EXTENSIONS = [
    '.pdf',
    '.jpg',
    '.jpeg',
    '.png',
    '.heic',
    '.heif',
    '.gif',
    '.webp',
    '.tif',
    '.tiff',
    '.doc',
    '.docx',
    '.xls',
    '.xlsx',
    '.ppt',
    '.pptx',
    '.txt',
    '.csv',
];
export const ACCEPT_ATTRIBUTE = ACCEPTED_EXTENSIONS.join(',');
export const ACCEPTED_DESCRIPTION =
    'PDFs, photos, Word, Excel, PowerPoint, text and CSV files';
export const MAX_FILE_SIZE = 20 * 1024 * 1024;
export const MAX_FILES = 10;

const VIEWABLE_EXTENSIONS = [
    '.pdf',
    '.jpg',
    '.jpeg',
    '.png',
    '.gif',
    '.webp',
    '.txt',
];

function extensionOf(name) {
    const dot = name.lastIndexOf('.');
    return dot === -1 ? '' : name.slice(dot).toLowerCase();
}

// Whether a browser can show the file in a tab (otherwise it downloads).
export function isViewable(filename) {
    return VIEWABLE_EXTENSIONS.includes(extensionOf(filename));
}

export function formatFileSize(bytes) {
    if (bytes < 1024) return `${bytes} B`;
    if (bytes < 1024 * 1024) return `${Math.round(bytes / 1024)} KB`;
    return `${(bytes / (1024 * 1024)).toFixed(1)} MB`;
}

// Why a file can't be uploaded, or null if it's fine. The server checks
// again, including the file's contents.
export function rejectionReason(file) {
    if (!ACCEPTED_EXTENSIONS.includes(extensionOf(file.name)))
        return `this type of file isn't allowed (allowed: ${ACCEPTED_DESCRIPTION})`;
    if (file.size > MAX_FILE_SIZE) return 'files must be 20 MB or smaller';
    return null;
}

// Splits files into accepted ones and a message describing the rest.
export function checkFiles(fileList, alreadySelected = 0) {
    const accepted = [];
    const problems = [];
    for (const file of fileList) {
        const reason = rejectionReason(file);
        if (reason) problems.push(`${file.name}: ${reason}`);
        else accepted.push(file);
    }
    const room = MAX_FILES - alreadySelected;
    if (accepted.length > room) {
        problems.push(`You can upload at most ${MAX_FILES} files at once`);
        accepted.splice(room);
    }
    return {
        accepted,
        error: problems.length ? problems.join('. ') + '.' : null,
    };
}

// Uploads a task's form. The server marks the task done (and the project,
// once every form is in).
export function uploadForm(task, files) {
    const body = new FormData();
    files.forEach((file) => body.append('files', file));
    return api.post(`/tasks/${task.id}/attachments`, body);
}

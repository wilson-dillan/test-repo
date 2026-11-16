import { api } from '../api';

export const ACCEPTED_TYPES = {
    'application/pdf': ['.pdf'],
    'image/jpeg': ['.jpg', '.jpeg'],
};
export const ACCEPT_ATTRIBUTE = '.pdf,.jpg,.jpeg,application/pdf,image/jpeg';
export const MAX_FILE_SIZE = 10 * 1024 * 1024;
export const MAX_FILES = 10;

export function formatFileSize(bytes) {
    if (bytes < 1024) return `${bytes} B`;
    if (bytes < 1024 * 1024) return `${Math.round(bytes / 1024)} KB`;
    return `${(bytes / (1024 * 1024)).toFixed(1)} MB`;
}

// Why a file can't be uploaded, or null if it's fine. The server checks
// again, including the file's contents.
export function rejectionReason(file) {
    const extension = file.name.slice(file.name.lastIndexOf('.')).toLowerCase();
    if (!ACCEPTED_TYPES[file.type]?.includes(extension))
        return 'only PDF and JPEG files are allowed';
    if (file.size > MAX_FILE_SIZE) return 'files must be 10 MB or smaller';
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

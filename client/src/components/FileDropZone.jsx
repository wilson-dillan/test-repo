import { useEffect, useRef, useState } from 'react';
import PropTypes from 'prop-types';
import Button from 'react-bootstrap/Button';
import { FontAwesomeIcon } from '@fortawesome/react-fontawesome';
import { faCloudArrowUp } from '@fortawesome/free-solid-svg-icons/faCloudArrowUp';
import { faXmark } from '@fortawesome/free-solid-svg-icons/faXmark';
import { AttachmentIcon } from './AttachmentIcon';
import { formatFileSize } from './fileSize';
import './FileDropZone.scss';

const ACCEPTED_TYPES = {
    'application/pdf': ['.pdf'],
    'image/jpeg': ['.jpg', '.jpeg'],
};
const MAX_FILE_SIZE = 10 * 1024 * 1024;
const MAX_FILES = 10;

function rejectionReason(file) {
    const extension = file.name.slice(file.name.lastIndexOf('.')).toLowerCase();
    if (!ACCEPTED_TYPES[file.type]?.includes(extension))
        return 'only PDF and JPEG files are allowed';
    if (file.size > MAX_FILE_SIZE) return 'files must be 10 MB or smaller';
    return null;
}

export function FileDropZone({ files, onFilesChange, disabled }) {
    const [dragging, setDragging] = useState(false);
    const [error, setError] = useState(null);
    const inputRef = useRef(null);

    // Stop the browser from opening a file that misses the drop zone,
    // which would navigate away and lose the form.
    useEffect(() => {
        const preventDefault = (e) => e.preventDefault();
        window.addEventListener('dragover', preventDefault);
        window.addEventListener('drop', preventDefault);
        return () => {
            window.removeEventListener('dragover', preventDefault);
            window.removeEventListener('drop', preventDefault);
        };
    }, []);

    const addFiles = (fileList) => {
        const accepted = [];
        const problems = [];
        for (const file of fileList) {
            const reason = rejectionReason(file);
            if (reason) problems.push(`${file.name}: ${reason}`);
            else accepted.push(file);
        }

        const room = MAX_FILES - files.length;
        if (accepted.length > room) {
            problems.push(`You can attach at most ${MAX_FILES} files`);
            accepted.splice(room);
        }

        setError(problems.length ? problems.join('. ') + '.' : null);
        if (accepted.length) onFilesChange([...files, ...accepted]);
    };

    const removeFile = (index) => {
        setError(null);
        onFilesChange(files.filter((_, i) => i !== index));
    };

    const openFilePicker = () => {
        if (!disabled) inputRef.current.click();
    };

    return (
        <div className="file-drop">
            <div
                className={`drop-zone ${dragging ? 'dragging' : ''} ${
                    disabled ? 'disabled' : ''
                }`}
                role="button"
                tabIndex={disabled ? -1 : 0}
                aria-label="Attach PDF or JPEG files"
                onClick={openFilePicker}
                onKeyDown={(e) => {
                    if (e.key === 'Enter' || e.key === ' ') {
                        e.preventDefault();
                        openFilePicker();
                    }
                }}
                onDragOver={(e) => {
                    e.preventDefault();
                    if (!disabled) setDragging(true);
                }}
                onDragLeave={(e) => {
                    if (!e.currentTarget.contains(e.relatedTarget))
                        setDragging(false);
                }}
                onDrop={(e) => {
                    e.preventDefault();
                    setDragging(false);
                    if (!disabled) addFiles(e.dataTransfer.files);
                }}
            >
                <FontAwesomeIcon icon={faCloudArrowUp} className="drop-icon" />
                <div>
                    <strong>Drag &amp; drop files here</strong> or click to
                    browse
                </div>
                <small className="text-muted">
                    PDF or JPEG, up to 10 MB each
                </small>
                <input
                    ref={inputRef}
                    type="file"
                    multiple
                    hidden
                    accept=".pdf,.jpg,.jpeg,application/pdf,image/jpeg"
                    onChange={(e) => {
                        addFiles(e.target.files);
                        e.target.value = '';
                    }}
                />
            </div>

            {error && <div className="drop-error text-danger">{error}</div>}

            {files.length > 0 && (
                <ul className="selected-files">
                    {files.map((file, index) => (
                        <li key={`${file.name}-${file.lastModified}-${index}`}>
                            <AttachmentIcon mimeType={file.type} />
                            <span className="file-name">{file.name}</span>
                            <span className="file-size text-muted">
                                {formatFileSize(file.size)}
                            </span>
                            <Button
                                size="sm"
                                variant="link"
                                className="text-secondary"
                                onClick={() => removeFile(index)}
                                disabled={disabled}
                                aria-label={`Remove ${file.name}`}
                            >
                                <FontAwesomeIcon icon={faXmark} />
                            </Button>
                        </li>
                    ))}
                </ul>
            )}
        </div>
    );
}

FileDropZone.propTypes = {
    files: PropTypes.arrayOf(PropTypes.instanceOf(File)).isRequired,
    onFilesChange: PropTypes.func.isRequired,
    disabled: PropTypes.bool,
};

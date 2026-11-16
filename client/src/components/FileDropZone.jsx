import { useEffect, useRef, useState } from 'react';
import PropTypes from 'prop-types';
import Button from 'react-bootstrap/Button';
import { FontAwesomeIcon } from '@fortawesome/react-fontawesome';
import { faCloudArrowUp } from '@fortawesome/free-solid-svg-icons/faCloudArrowUp';
import { faXmark } from '@fortawesome/free-solid-svg-icons/faXmark';
import { AttachmentIcon } from './AttachmentIcon';
import {
    ACCEPT_ATTRIBUTE,
    MAX_FILES,
    checkFiles,
    formatFileSize,
} from './files';
import './FileDropZone.scss';

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
        const { accepted, error } = checkFiles(fileList, files.length);
        setError(error);
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
                    PDF or JPEG, up to 10 MB each, {MAX_FILES} at a time
                </small>
                <input
                    ref={inputRef}
                    type="file"
                    multiple
                    hidden
                    accept={ACCEPT_ATTRIBUTE}
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

import { useEffect, useMemo, useState } from 'react';
import PropTypes from 'prop-types';
import Alert from 'react-bootstrap/Alert';
import Button from 'react-bootstrap/Button';
import Modal from 'react-bootstrap/Modal';
import { FontAwesomeIcon } from '@fortawesome/react-fontawesome';
import { faArrowUpRightFromSquare } from '@fortawesome/free-solid-svg-icons';
import { formLabel } from '../format';
import { AttachmentIcon } from './AttachmentIcon';
import { formatFileSize } from './files';

// What the browser can preview from a file on the user's own computer.
function previewKind(file) {
    if (file.type === 'application/pdf' || /\.pdf$/i.test(file.name))
        return 'pdf';
    if (/^image\/(jpeg|png|gif|webp)$/.test(file.type)) return 'image';
    return null;
}

// "Is this the right document?" before uploading, with a preview and a
// link to open each chosen file in a new tab. Uploading completes the task.
export function UploadConfirm({ task, files, onCancel, onConfirm }) {
    const [busy, setBusy] = useState(false);
    const [error, setError] = useState(null);
    // Large PDFs and photos can take a moment to draw.
    const [loaded, setLoaded] = useState(false);
    useEffect(() => setLoaded(false), [files]);

    // Temporary links to the chosen files, released when the popup closes.
    const urls = useMemo(
        () => files.map((file) => URL.createObjectURL(file)),
        [files],
    );
    useEffect(
        () => () => urls.forEach((url) => URL.revokeObjectURL(url)),
        [urls],
    );

    const first = files[0];
    const kind = first && previewKind(first);

    const confirm = async () => {
        setBusy(true);
        setError(null);
        try {
            await onConfirm();
        } catch (err) {
            setError(err.message);
            setBusy(false);
        }
    };

    return (
        <Modal
            show={files.length > 0}
            onHide={busy ? undefined : onCancel}
            onExited={() => {
                setBusy(false);
                setError(null);
            }}
            centered
            // No fade-in: the popup should appear the moment a file lands.
            animation={false}
            className="upload-confirm"
        >
            <Modal.Body className="p-4">
                <h2 className="h4 mb-3 text-center">
                    Is this the {formLabel(task.name)}?
                </h2>

                {first && (
                    <a
                        className="preview"
                        href={urls[0]}
                        target="_blank"
                        rel="noopener noreferrer"
                        title="Open in a new tab"
                    >
                        {kind && !loaded && (
                            <span className="loading">Loading preview…</span>
                        )}
                        {kind === 'image' && (
                            <img
                                src={urls[0]}
                                alt=""
                                onLoad={() => setLoaded(true)}
                                hidden={!loaded}
                            />
                        )}
                        {kind === 'pdf' && (
                            <iframe
                                src={`${urls[0]}#toolbar=0&navpanes=0&view=FitH`}
                                title="Preview"
                                tabIndex={-1}
                                onLoad={() => setLoaded(true)}
                            />
                        )}
                        {!kind && (
                            <span className="no-preview">
                                <AttachmentIcon mimeType={first.type} />
                                No preview for this type of file
                            </span>
                        )}
                    </a>
                )}

                <ul className="chosen-files">
                    {files.map((file, i) => (
                        <li key={`${file.name}-${i}`}>
                            <a
                                href={urls[i]}
                                target="_blank"
                                rel="noopener noreferrer"
                            >
                                {file.name}
                                <FontAwesomeIcon
                                    icon={faArrowUpRightFromSquare}
                                    className="ms-2"
                                />
                            </a>
                            <span className="text-muted">
                                {formatFileSize(file.size)}
                            </span>
                        </li>
                    ))}
                </ul>

                {error && (
                    <Alert variant="danger" className="mt-3 mb-0">
                        {error}
                    </Alert>
                )}
                <div className="d-flex gap-2 justify-content-center mt-4">
                    <Button variant="light" onClick={onCancel} disabled={busy}>
                        Cancel
                    </Button>
                    <Button variant="success" onClick={confirm} disabled={busy}>
                        {busy ? 'Uploading…' : 'Yes, upload it'}
                    </Button>
                </div>
                <p className="undo-note">
                    Uploading completes this task and can&apos;t be undone.
                </p>
            </Modal.Body>
        </Modal>
    );
}

UploadConfirm.propTypes = {
    task: PropTypes.object.isRequired,
    files: PropTypes.array.isRequired,
    onCancel: PropTypes.func.isRequired,
    onConfirm: PropTypes.func.isRequired,
};

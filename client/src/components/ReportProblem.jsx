import { useEffect, useMemo, useRef, useState } from 'react';
import PropTypes from 'prop-types';
import { useLocation } from 'react-router-dom';
import Alert from 'react-bootstrap/Alert';
import Button from 'react-bootstrap/Button';
import Form from 'react-bootstrap/Form';
import Modal from 'react-bootstrap/Modal';
import { FontAwesomeIcon } from '@fortawesome/react-fontawesome';
import { faImage, faXmark } from '@fortawesome/free-solid-svg-icons';
import { api } from '../api';
import { useToast } from '../toastContext';

const SCREENSHOT_TYPES = ['image/png', 'image/jpeg', 'image/gif', 'image/webp'];
const MAX_SCREENSHOT_SIZE = 10 * 1024 * 1024;

function screenshotProblem(file) {
    if (!SCREENSHOT_TYPES.includes(file.type))
        return 'The screenshot must be a PNG, JPEG, GIF or WebP image.';
    if (file.size > MAX_SCREENSHOT_SIZE)
        return 'The screenshot must be 10 MB or smaller.';
    return null;
}

// "Report a problem" popup. The page it was opened from is sent along,
// with an optional screenshot (chosen, dropped or pasted).
export function ReportProblem({ show, onHide }) {
    const { pathname } = useLocation();
    const showToast = useToast();
    const input = useRef(null);
    const [description, setDescription] = useState('');
    const [screenshot, setScreenshot] = useState(null);
    const [dragging, setDragging] = useState(false);
    const [busy, setBusy] = useState(false);
    const [error, setError] = useState(null);

    const previewUrl = useMemo(
        () => screenshot && URL.createObjectURL(screenshot),
        [screenshot],
    );
    useEffect(
        () => () => previewUrl && URL.revokeObjectURL(previewUrl),
        [previewUrl],
    );

    const attach = (file) => {
        if (!file) return;
        const problem = screenshotProblem(file);
        setError(problem);
        if (!problem) setScreenshot(file);
    };

    const close = () => {
        setDescription('');
        setScreenshot(null);
        setError(null);
        onHide();
    };

    const send = async (e) => {
        e.preventDefault();
        setBusy(true);
        setError(null);
        try {
            const body = new FormData();
            body.append('description', description);
            body.append('page', pathname);
            if (screenshot)
                body.append(
                    'screenshot',
                    screenshot,
                    screenshot.name || 'screenshot.png',
                );
            await api.post('/reports', body);
            close();
            showToast('Thanks! Your report was sent to the admin.');
        } catch (err) {
            setError(err.message);
        } finally {
            setBusy(false);
        }
    };

    return (
        <Modal show={show} onHide={busy ? undefined : close} centered>
            <Form
                onSubmit={send}
                // A screenshot copied to the clipboard can be pasted anywhere
                // in the popup.
                onPaste={(e) => {
                    const file = [...e.clipboardData.files].find((f) =>
                        f.type.startsWith('image/'),
                    );
                    if (file) {
                        e.preventDefault();
                        attach(file);
                    }
                }}
            >
                <Modal.Header closeButton>
                    <Modal.Title as="h2" className="h5">
                        Report a problem
                    </Modal.Title>
                </Modal.Header>
                <Modal.Body>
                    <Form.Group controlId="problemDescription">
                        <Form.Label>What went wrong?</Form.Label>
                        <Form.Control
                            as="textarea"
                            rows={5}
                            value={description}
                            onChange={(e) => setDescription(e.target.value)}
                            placeholder="What were you trying to do, and what happened instead?"
                            maxLength={4000}
                            autoFocus
                        />
                        <Form.Text>
                            The page you&apos;re on is included automatically.
                        </Form.Text>
                    </Form.Group>

                    <div className="mt-3">
                        <div className="form-label">Screenshot (optional)</div>
                        {screenshot ? (
                            <div className="report-shot">
                                <img
                                    src={previewUrl}
                                    alt="Screenshot to send"
                                />
                                <Button
                                    variant="light"
                                    size="sm"
                                    onClick={() => setScreenshot(null)}
                                    aria-label="Remove screenshot"
                                >
                                    <FontAwesomeIcon icon={faXmark} />
                                </Button>
                            </div>
                        ) : (
                            <button
                                type="button"
                                className={`report-drop ${dragging ? 'dragging' : ''}`}
                                onClick={() => input.current.click()}
                                onDragOver={(e) => {
                                    e.preventDefault();
                                    setDragging(true);
                                }}
                                onDragLeave={() => setDragging(false)}
                                onDrop={(e) => {
                                    e.preventDefault();
                                    setDragging(false);
                                    attach(e.dataTransfer.files[0]);
                                }}
                            >
                                <FontAwesomeIcon icon={faImage} />
                                <span>
                                    <strong>Add a screenshot</strong>
                                    <small>
                                        Click, drop an image, or paste with
                                        Ctrl/⌘ + V
                                    </small>
                                </span>
                            </button>
                        )}
                        <input
                            ref={input}
                            type="file"
                            hidden
                            accept={SCREENSHOT_TYPES.join(',')}
                            onChange={(e) => {
                                attach(e.target.files[0]);
                                e.target.value = '';
                            }}
                        />
                    </div>

                    {error && (
                        <Alert variant="danger" className="mt-3 mb-0">
                            {error}
                        </Alert>
                    )}
                </Modal.Body>
                <Modal.Footer>
                    <Button variant="light" onClick={close} disabled={busy}>
                        Cancel
                    </Button>
                    <Button
                        type="submit"
                        disabled={busy || !description.trim()}
                    >
                        {busy ? 'Sending…' : 'Send report'}
                    </Button>
                </Modal.Footer>
            </Form>
        </Modal>
    );
}

ReportProblem.propTypes = {
    show: PropTypes.bool.isRequired,
    onHide: PropTypes.func.isRequired,
};

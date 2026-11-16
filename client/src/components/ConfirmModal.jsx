import { useState } from 'react';
import PropTypes from 'prop-types';
import Alert from 'react-bootstrap/Alert';
import Button from 'react-bootstrap/Button';
import Modal from 'react-bootstrap/Modal';
import { FontAwesomeIcon } from '@fortawesome/react-fontawesome';

// A confirmation dialog whose confirm action may be async; it shows a
// busy state and any error without closing.
export function ConfirmModal({
    show,
    onHide,
    onConfirm,
    icon,
    tone = 'danger',
    title,
    children,
    confirmLabel,
    confirmVariant = 'primary',
}) {
    const [busy, setBusy] = useState(false);
    const [error, setError] = useState(null);

    const confirm = async () => {
        setBusy(true);
        setError(null);
        try {
            await onConfirm();
            onHide();
        } catch (err) {
            setError(err.message);
        } finally {
            setBusy(false);
        }
    };

    return (
        <Modal
            show={show}
            onHide={busy ? undefined : onHide}
            onExited={() => setError(null)}
            centered
        >
            <Modal.Body className="p-4 text-center">
                {icon && (
                    <div
                        className={`confirm-icon ${tone === 'success' ? 'success' : ''}`}
                    >
                        <FontAwesomeIcon icon={icon} />
                    </div>
                )}
                <h2 className="h4 mb-2">{title}</h2>
                <div className="text-muted">{children}</div>
                {error && (
                    <Alert variant="danger" className="mt-3 mb-0 text-start">
                        {error}
                    </Alert>
                )}
                <div className="d-flex gap-2 justify-content-center mt-4">
                    <Button variant="light" onClick={onHide} disabled={busy}>
                        Cancel
                    </Button>
                    <Button
                        variant={confirmVariant}
                        onClick={confirm}
                        disabled={busy}
                        autoFocus
                    >
                        {busy ? 'Working…' : confirmLabel}
                    </Button>
                </div>
            </Modal.Body>
        </Modal>
    );
}

ConfirmModal.propTypes = {
    show: PropTypes.bool,
    onHide: PropTypes.func.isRequired,
    onConfirm: PropTypes.func.isRequired,
    icon: PropTypes.object,
    tone: PropTypes.string,
    title: PropTypes.node,
    children: PropTypes.node,
    confirmLabel: PropTypes.string,
    confirmVariant: PropTypes.string,
};

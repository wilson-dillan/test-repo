import { useState } from 'react';
import PropTypes from 'prop-types';
import Button from 'react-bootstrap/Button';
import { FontAwesomeIcon } from '@fortawesome/react-fontawesome';
import {
    faBoxArchive,
    faTrashCan,
    faRotateLeft,
} from '@fortawesome/free-solid-svg-icons';
import { ConfirmModal } from './ConfirmModal';

// A red trash can for projects. Nothing is ever deleted: the popup
// explains that discarding means setting the application inactive.
// Inactive projects stay listed everywhere and anyone can reactivate them.
// `canDiscard` is false once the application has been submitted.
export function ActiveControl({ active, canDiscard, onChange }) {
    const [confirming, setConfirming] = useState(null);

    if (active && !canDiscard) return null;

    return (
        <>
            {active ? (
                <Button
                    variant="outline-danger"
                    className="btn-discard"
                    onClick={() => setConfirming('inactive')}
                    title="Discard application"
                    aria-label="Discard application"
                >
                    <FontAwesomeIcon icon={faTrashCan} />
                </Button>
            ) : (
                <Button
                    variant="outline-primary"
                    onClick={() => setConfirming('active')}
                >
                    <FontAwesomeIcon icon={faRotateLeft} className="me-2" />
                    Reactivate
                </Button>
            )}
            <ConfirmModal
                show={confirming === 'inactive'}
                onHide={() => setConfirming(null)}
                onConfirm={() => onChange(false)}
                icon={faBoxArchive}
                title="Applications can't be deleted"
                confirmLabel="Set as inactive"
                confirmVariant="danger"
            >
                <p>
                    <strong>
                        To discard an application, you must set it as inactive.
                    </strong>{' '}
                    Nothing is deleted: it stays listed with an Inactive label.
                </p>
                <p className="mb-0">
                    An inactive application can&apos;t be edited: no uploads,
                    notes, reassignments or changes. You can reactivate it later
                    if you need it again.
                </p>
            </ConfirmModal>
            <ConfirmModal
                show={confirming === 'active'}
                onHide={() => setConfirming(null)}
                onConfirm={() => onChange(true)}
                icon={faRotateLeft}
                tone="success"
                title="Reactivate this application?"
                confirmLabel="Reactivate"
            >
                It goes back to being a normal, active application. This is
                recorded in the history.
            </ConfirmModal>
        </>
    );
}

ActiveControl.propTypes = {
    active: PropTypes.bool.isRequired,
    canDiscard: PropTypes.bool.isRequired,
    onChange: PropTypes.func.isRequired,
};

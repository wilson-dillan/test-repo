import { useState } from 'react';
import PropTypes from 'prop-types';
import Button from 'react-bootstrap/Button';
import { FontAwesomeIcon } from '@fortawesome/react-fontawesome';
import {
    faBoxArchive,
    faTrashCan,
    faLock,
    faRotateLeft,
} from '@fortawesome/free-solid-svg-icons';
import { ConfirmModal } from './ConfirmModal';
import { StatePill } from './ui';
import { useAuth } from '../hooks';

// A task's To Do / Done state. Uploading its document marks it done; the
// super user can reopen it.
export function StateControl({ state, what, onChange }) {
    const { user } = useAuth();
    const [confirming, setConfirming] = useState(false);

    return (
        <div className="state-panel">
            <StatePill state={state} />
            {state === 'done' && user.isSuper && (
                <Button
                    variant="outline-secondary"
                    onClick={() => setConfirming(true)}
                >
                    <FontAwesomeIcon icon={faRotateLeft} className="me-2" />
                    Reopen
                </Button>
            )}
            {state === 'done' && !user.isSuper && (
                <span className="lock-note">
                    <FontAwesomeIcon icon={faLock} className="me-1" />
                    Only an admin can reopen this.
                </span>
            )}

            <ConfirmModal
                show={confirming}
                onHide={() => setConfirming(false)}
                onConfirm={() => onChange('todo')}
                icon={faRotateLeft}
                tone="success"
                title={`Reopen this ${what}?`}
                confirmLabel="Reopen"
            >
                It will move back to To Do. This is recorded in the history.
            </ConfirmModal>
        </div>
    );
}

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

StateControl.propTypes = {
    state: PropTypes.oneOf(['todo', 'done']).isRequired,
    what: PropTypes.string.isRequired,
    onChange: PropTypes.func.isRequired,
};

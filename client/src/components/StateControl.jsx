import { useState } from 'react';
import PropTypes from 'prop-types';
import Button from 'react-bootstrap/Button';
import { FontAwesomeIcon } from '@fortawesome/react-fontawesome';
import {
    faBoxArchive,
    faTrashCan,
    faCircleCheck,
    faLock,
    faRotateLeft,
    faTriangleExclamation,
} from '@fortawesome/free-solid-svg-icons';
import { ConfirmModal } from './ConfirmModal';
import { StatePill } from './ui';
import { useAuth } from '../hooks';

// Shows the To Do / Done state with a "Mark as done" button that asks for
// confirmation, since only the super user can reopen something.
export function StateControl({
    state,
    status,
    what,
    onChange,
    doneHint,
    autoComplete,
}) {
    const { user } = useAuth();
    const [confirming, setConfirming] = useState(null);

    return (
        <div className="state-panel">
            <StatePill state={status || state} />
            {state === 'todo' && doneHint && (
                <span className="lock-note">{doneHint}</span>
            )}
            {state === 'todo' && !doneHint && !autoComplete && (
                <Button variant="success" onClick={() => setConfirming('done')}>
                    <FontAwesomeIcon icon={faCircleCheck} className="me-2" />
                    Mark as done
                </Button>
            )}
            {state === 'done' && user.isSuper && (
                <Button
                    variant="outline-secondary"
                    onClick={() => setConfirming('todo')}
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
                show={confirming === 'done'}
                onHide={() => setConfirming(null)}
                onConfirm={() => onChange('done')}
                icon={faTriangleExclamation}
                title="Are you sure you want to mark this as done?"
                confirmLabel="Yes, mark as done"
                confirmVariant="success"
            >
                Once this {what} is done, it can&apos;t be undone. Only an admin
                can reopen it.
            </ConfirmModal>
            <ConfirmModal
                show={confirming === 'todo'}
                onHide={() => setConfirming(null)}
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
    // what the pill shows, e.g. 'in_progress' for a project
    status: PropTypes.string,
    what: PropTypes.string.isRequired,
    onChange: PropTypes.func.isRequired,
    // Shown instead of "Mark as done" when something else completes it.
    doneHint: PropTypes.string,
    // Completed by something else (an upload): no "Mark as done" button.
    autoComplete: PropTypes.bool,
};

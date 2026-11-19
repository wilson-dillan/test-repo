import { useState } from 'react';
import PropTypes from 'prop-types';
import Alert from 'react-bootstrap/Alert';
import Button from 'react-bootstrap/Button';
import Form from 'react-bootstrap/Form';
import Modal from 'react-bootstrap/Modal';
import { FontAwesomeIcon } from '@fortawesome/react-fontawesome';
import {
    faPaperPlane,
    faRotateLeft,
    faSackDollar,
} from '@fortawesome/free-solid-svg-icons';
import { api } from '../api';
import { useAuth } from '../hooks';
import { useToast } from '../toastContext';
import { formatDate, formatMoney } from '../format';
import { ConfirmModal } from './ConfirmModal';
import { ProjectStatusPill } from './ui';

// The application's stage and the one action that moves it forward:
// To Do / In Progress -> "Mark as submitted" -> "Rebate Received" -> Done.
export function StageControl({ project, onChanged }) {
    const { user, notifyChange } = useAuth();
    const showToast = useToast();
    const [dialog, setDialog] = useState(null);
    const missing = project.tasks.filter(
        (t) => t.active && t.state === 'todo',
    ).length;

    const act = async (path) => {
        onChanged(await api.post(`/projects/${project.id}/${path}`));
        notifyChange();
    };

    return (
        <div className="stage-control">
            <ProjectStatusPill status={project.status} />

            {project.active && project.state === 'todo' && (
                <div className="stage-action">
                    <Button
                        onClick={() => setDialog('submit')}
                        disabled={missing > 0}
                    >
                        <FontAwesomeIcon icon={faPaperPlane} className="me-2" />
                        Mark as submitted
                    </Button>
                    <div className="stage-hint">
                        {missing > 0
                            ? `Upload ${missing} more document${missing > 1 ? 's' : ''} first`
                            : 'All documents are in'}
                    </div>
                </div>
            )}

            {project.active && project.state === 'submitted' && (
                <div className="stage-action">
                    <Button
                        variant="success"
                        onClick={() => setDialog('rebate')}
                    >
                        <FontAwesomeIcon icon={faSackDollar} className="me-2" />
                        Rebate Received
                    </Button>
                    <div className="stage-hint">
                        Marks the application as Done
                    </div>
                </div>
            )}

            {project.active && project.state === 'done' && user.isSuper && (
                <Button
                    variant="outline-secondary"
                    size="sm"
                    onClick={() => setDialog('reopen')}
                >
                    <FontAwesomeIcon icon={faRotateLeft} className="me-1" />
                    Back to Submitted
                </Button>
            )}

            <ConfirmModal
                show={dialog === 'submit'}
                onHide={() => setDialog(null)}
                onConfirm={async () => {
                    await act('submit');
                    showToast('Application marked submitted');
                }}
                icon={faPaperPlane}
                tone="success"
                title="Mark this application as submitted?"
                confirmLabel="Yes, it's submitted"
            >
                Do this once the application has been sent to Mass Save. This
                can&apos;t be undone.
            </ConfirmModal>

            <ConfirmModal
                show={dialog === 'reopen'}
                onHide={() => setDialog(null)}
                onConfirm={() => act('reopen')}
                icon={faRotateLeft}
                tone="success"
                title="Move back to Submitted?"
                confirmLabel="Move back"
            >
                This clears the rebate details. It is recorded in the history.
            </ConfirmModal>

            <RebateModal
                show={dialog === 'rebate'}
                project={project}
                onHide={() => setDialog(null)}
                onDone={(updated) => {
                    onChanged(updated);
                    notifyChange();
                    setDialog(null);
                    showToast('Success');
                }}
            />
        </div>
    );
}

StageControl.propTypes = {
    project: PropTypes.object.isRequired,
    onChanged: PropTypes.func.isRequired,
};

const today = () => new Date().toLocaleDateString('en-CA');

// Asks for the rebate details, then shows them back to double-check
// before marking the application Done.
function RebateModal({ show, project, onHide, onDone }) {
    const [step, setStep] = useState('enter'); // enter | confirm
    const [values, setValues] = useState({
        number: '',
        amount: '',
        receivedOn: today(),
    });
    const [duplicate, setDuplicate] = useState(null);
    const [error, setError] = useState(null);
    const [busy, setBusy] = useState(false);

    const reset = () => {
        setStep('enter');
        setValues({ number: '', amount: '', receivedOn: today() });
        setDuplicate(null);
        setError(null);
    };
    const set = (key) => (e) => {
        setValues((v) => ({ ...v, [key]: e.target.value }));
        setDuplicate(null);
    };

    const review = (e) => {
        e.preventDefault();
        const amount = Number(values.amount);
        if (!values.number.trim()) return setError('Enter the rebate number.');
        if (!(amount > 0)) return setError('Enter the rebate amount.');
        if (!values.receivedOn) return setError('Enter the date received.');
        setError(null);
        setStep('confirm');
    };

    const save = async (allowDuplicate = false) => {
        setBusy(true);
        setError(null);
        try {
            onDone(
                await api.post(`/projects/${project.id}/rebate`, {
                    number: values.number.trim(),
                    amount: Number(values.amount),
                    receivedOn: values.receivedOn,
                    allowDuplicate,
                }),
            );
        } catch (err) {
            if (
                err.status === 409 &&
                /already recorded on project/.test(err.message)
            )
                setDuplicate(err.message);
            else setError(err.message);
        } finally {
            setBusy(false);
        }
    };

    return (
        <Modal
            show={show}
            onHide={busy ? undefined : onHide}
            onExited={reset}
            centered
        >
            {step === 'enter' ? (
                <Form onSubmit={review}>
                    <Modal.Header closeButton>
                        <Modal.Title>Rebate Received</Modal.Title>
                    </Modal.Header>
                    <Modal.Body>
                        <p className="text-muted">
                            Enter the rebate details for{' '}
                            <strong>{project.customerName}</strong>. Saving
                            marks the application as{' '}
                            <strong>Done (Rebate received)</strong>.
                        </p>
                        <Form.Group className="mb-3" controlId="rebateNumber">
                            <Form.Label>Rebate number</Form.Label>
                            <Form.Control
                                value={values.number}
                                onChange={set('number')}
                                maxLength={50}
                                autoFocus
                                required
                            />
                        </Form.Group>
                        <div className="row g-3">
                            <Form.Group
                                className="col-sm-6"
                                controlId="rebateAmount"
                            >
                                <Form.Label>Amount ($)</Form.Label>
                                <Form.Control
                                    type="number"
                                    inputMode="decimal"
                                    min="0.01"
                                    step="0.01"
                                    value={values.amount}
                                    onChange={set('amount')}
                                    required
                                />
                            </Form.Group>
                            <Form.Group
                                className="col-sm-6"
                                controlId="rebateDate"
                            >
                                <Form.Label>Date received</Form.Label>
                                <Form.Control
                                    type="date"
                                    max={today()}
                                    value={values.receivedOn}
                                    onChange={set('receivedOn')}
                                    required
                                />
                            </Form.Group>
                        </div>
                        {error && (
                            <Alert variant="danger" className="mt-3 mb-0">
                                {error}
                            </Alert>
                        )}
                    </Modal.Body>
                    <Modal.Footer>
                        <Button variant="light" onClick={onHide}>
                            Cancel
                        </Button>
                        <Button type="submit">Review</Button>
                    </Modal.Footer>
                </Form>
            ) : (
                <>
                    <Modal.Header closeButton={!busy}>
                        <Modal.Title>Is this correct?</Modal.Title>
                    </Modal.Header>
                    <Modal.Body>
                        <dl className="rebate-check">
                            <dt>Customer</dt>
                            <dd>{project.customerName}</dd>
                            <dt>Rebate number</dt>
                            <dd>{values.number.trim()}</dd>
                            <dt>Amount</dt>
                            <dd>{formatMoney(Number(values.amount))}</dd>
                            <dt>Received</dt>
                            <dd>{formatDate(values.receivedOn)}</dd>
                        </dl>
                        <Alert variant="success" className="mb-0">
                            This marks the application as{' '}
                            <strong>Done (Rebate received)</strong>. It
                            can&apos;t be undone; only an admin can reopen it.
                        </Alert>
                        {duplicate && (
                            <Alert variant="warning" className="mt-3 mb-0">
                                {duplicate}
                            </Alert>
                        )}
                        {error && (
                            <Alert variant="danger" className="mt-3 mb-0">
                                {error}
                            </Alert>
                        )}
                    </Modal.Body>
                    <Modal.Footer>
                        <Button
                            variant="light"
                            onClick={() => setStep('enter')}
                            disabled={busy}
                        >
                            Back
                        </Button>
                        {duplicate ? (
                            <Button
                                variant="warning"
                                onClick={() => save(true)}
                                disabled={busy}
                            >
                                It&apos;s correct, save anyway
                            </Button>
                        ) : (
                            <Button
                                variant="success"
                                onClick={() => save(false)}
                                disabled={busy}
                            >
                                {busy ? 'Saving…' : 'Yes, mark as Done'}
                            </Button>
                        )}
                    </Modal.Footer>
                </>
            )}
        </Modal>
    );
}

RebateModal.propTypes = {
    show: PropTypes.bool,
    project: PropTypes.object.isRequired,
    onHide: PropTypes.func.isRequired,
    onDone: PropTypes.func.isRequired,
};

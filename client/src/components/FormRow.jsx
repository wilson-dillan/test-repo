import { useRef, useState } from 'react';
import PropTypes from 'prop-types';
import { Link } from 'react-router-dom';
import Button from 'react-bootstrap/Button';
import Form from 'react-bootstrap/Form';
import { FontAwesomeIcon } from '@fortawesome/react-fontawesome';
import {
    faArrowUpRightFromSquare,
    faCheck,
    faFileArrowUp,
    faUpload,
} from '@fortawesome/free-solid-svg-icons';
import { api } from '../api';
import { useAuth } from '../hooks';
import { formLabel, formatDateTime } from '../format';
import { ConfirmModal } from './ConfirmModal';
import { ACCEPT_ATTRIBUTE, checkFiles, uploadForm } from './files';

// Asks "Is this the <form> form?" before an upload, since uploading
// completes the task and can't be undone.
export function ConfirmFormUpload({ task, files, onHide, onConfirm }) {
    return (
        <ConfirmModal
            show={files.length > 0}
            onHide={onHide}
            onConfirm={onConfirm}
            icon={faFileArrowUp}
            tone="success"
            title={`Is this the ${formLabel(task.name)}?`}
            confirmLabel="Yes, upload it"
            confirmVariant="success"
        >
            <div className="mb-2 fw-semibold text-body">
                {files.map((f) => f.name).join(', ')}
            </div>
            {task.state === 'done'
                ? 'This adds a new version of the document.'
                : "This completes the task and can't be undone."}
        </ConfirmModal>
    );
}

ConfirmFormUpload.propTypes = {
    task: PropTypes.object.isRequired,
    files: PropTypes.array.isRequired,
    onHide: PropTypes.func.isRequired,
    onConfirm: PropTypes.func.isRequired,
};

// One form the project needs: who it's assigned to, and either an Upload
// button or a link to view the uploaded document. Files can also be
// dropped onto the row.
export function FormRow({ task, users, onChanged }) {
    const { user, notifyChange } = useAuth();
    const input = useRef(null);
    const [pending, setPending] = useState([]);
    const [dragging, setDragging] = useState(false);
    const [savingOwner, setSavingOwner] = useState(false);
    const [error, setError] = useState(null);

    const done = task.state === 'done';
    const canUpload = !done || user.isSuper;
    const doc = task.latestDocument;

    const choose = (fileList) => {
        const { accepted, error } = checkFiles([...fileList].slice(0, 1));
        setError(error);
        if (accepted.length) setPending(accepted);
    };

    const upload = async () => {
        await uploadForm(task, pending);
        setError(null);
        onChanged();
        notifyChange();
    };

    const reassign = async (e) => {
        setSavingOwner(true);
        setError(null);
        try {
            await api.patch(`/tasks/${task.id}`, {
                ownerId: Number(e.target.value),
            });
            onChanged();
            notifyChange();
        } catch (err) {
            setError(err.message);
        } finally {
            setSavingOwner(false);
        }
    };

    const ownerOptions = users.some((u) => u.id === task.owner.id)
        ? users
        : [...users, { id: task.owner.id, displayName: task.owner.name }];

    const dropHandlers = canUpload && {
        onDragOver: (e) => {
            e.preventDefault();
            setDragging(true);
        },
        onDragLeave: (e) => {
            if (!e.currentTarget.contains(e.relatedTarget)) setDragging(false);
        },
        onDrop: (e) => {
            e.preventDefault();
            setDragging(false);
            choose(e.dataTransfer.files);
        },
    };

    return (
        <div
            className={`form-row ${done ? 'is-done' : ''} ${dragging ? 'dragging' : ''}`}
            {...dropHandlers}
        >
            <div className="form-main">
                <Link to={`/tasks/${task.id}`} className="form-name">
                    {task.name}
                </Link>
                <div className="form-sub">
                    {!done && (
                        <>
                            Upload the form to complete the task
                            <span className="drop-hint">
                                {' '}
                                · or drag &amp; drop the file here
                            </span>
                        </>
                    )}
                    {done && (
                        <>
                            <FontAwesomeIcon icon={faCheck} className="me-1" />
                            {doc
                                ? `Uploaded ${formatDateTime(doc.createdAt)} by ${doc.uploadedBy}`
                                : 'Completed'}
                        </>
                    )}
                </div>
                {error && <div className="small text-danger mt-1">{error}</div>}
            </div>

            <label className="form-owner">
                <span>Assigned to</span>
                <Form.Select
                    size="sm"
                    value={task.owner.id}
                    onChange={reassign}
                    disabled={savingOwner}
                >
                    {ownerOptions.map((u) => (
                        <option key={u.id} value={u.id}>
                            {u.displayName}
                        </option>
                    ))}
                </Form.Select>
            </label>

            <div className="form-action">
                {doc && (
                    <a
                        href={`/api/attachments/${doc.id}`}
                        target="_blank"
                        rel="noopener noreferrer"
                        className="btn btn-outline-primary btn-sm"
                    >
                        <FontAwesomeIcon
                            icon={faArrowUpRightFromSquare}
                            className="me-2"
                        />
                        View document
                    </a>
                )}
                {!done && (
                    <Button size="sm" onClick={() => input.current.click()}>
                        <FontAwesomeIcon icon={faUpload} className="me-2" />
                        Upload
                    </Button>
                )}
                {done && user.isSuper && (
                    <Button
                        size="sm"
                        variant="link"
                        onClick={() => input.current.click()}
                    >
                        Replace
                    </Button>
                )}
                <input
                    ref={input}
                    type="file"
                    hidden
                    accept={ACCEPT_ATTRIBUTE}
                    onChange={(e) => {
                        choose(e.target.files);
                        e.target.value = '';
                    }}
                />
            </div>

            <ConfirmFormUpload
                task={task}
                files={pending}
                onHide={() => setPending([])}
                onConfirm={upload}
            />
        </div>
    );
}

FormRow.propTypes = {
    task: PropTypes.object.isRequired,
    users: PropTypes.array.isRequired,
    onChanged: PropTypes.func.isRequired,
};

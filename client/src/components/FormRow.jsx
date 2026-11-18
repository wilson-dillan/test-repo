import { useRef, useState } from 'react';
import PropTypes from 'prop-types';
import { Link } from 'react-router-dom';
import Button from 'react-bootstrap/Button';
import Form from 'react-bootstrap/Form';
import { FontAwesomeIcon } from '@fortawesome/react-fontawesome';
import {
    faArrowUpRightFromSquare,
    faCheck,
    faDownload,
    faChevronRight,
    faCloudArrowUp,
} from '@fortawesome/free-solid-svg-icons';
import { api } from '../api';
import { useAuth } from '../hooks';
import { formatDateTime } from '../format';
import { ACCEPT_ATTRIBUTE, checkFiles, isViewable, uploadForm } from './files';
import { UploadConfirm } from './UploadConfirm';

// One form the project needs: who it's assigned to, and either an Upload
// button or a link to view the uploaded document. Files can also be
// dropped onto the row.
// `readOnly` (inactive applications) shows the row without any actions.
export function FormRow({ task, users, onChanged, readOnly }) {
    const { user, notifyChange } = useAuth();
    const input = useRef(null);
    const [pending, setPending] = useState([]);
    const [dragging, setDragging] = useState(false);
    const [savingOwner, setSavingOwner] = useState(false);
    const [error, setError] = useState(null);

    const done = task.state === 'done';
    const canUpload = !readOnly && (!done || user.isSuper);
    const doc = task.latestDocument;

    // A chosen file is shown in a "Is this the right document?" popup
    // before it's uploaded, since uploading completes the task.
    const choose = (fileList) => {
        const { accepted, error } = checkFiles([...fileList].slice(0, 1));
        setError(error);
        if (accepted.length) setPending(accepted);
    };

    const upload = async () => {
        await uploadForm(task, pending);
        setPending([]);
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

    if (!task.active)
        return (
            <div className="form-row not-needed">
                <div className="form-main">
                    <Link to={`/tasks/${task.id}`} className="form-name">
                        {task.name}
                    </Link>
                    <div className="form-sub">
                        Not needed:{' '}
                        {/gas/i.test(task.name)
                            ? "the home doesn't heat with natural gas"
                            : 'not required for this project'}
                    </div>
                </div>
            </div>
        );

    return (
        <div
            className={`form-row ${done ? 'is-done' : ''} ${dragging ? 'dragging' : ''}`}
            {...dropHandlers}
        >
            <div className="form-main">
                <Link
                    to={`/tasks/${task.id}`}
                    className="form-name"
                    title="Open this task's details"
                >
                    {task.name}
                    <FontAwesomeIcon icon={faChevronRight} className="chev" />
                </Link>
                <div className="form-sub">
                    {!done && 'Upload the form to complete the task'}
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
                    disabled={savingOwner || readOnly}
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
                            icon={
                                isViewable(doc.filename)
                                    ? faArrowUpRightFromSquare
                                    : faDownload
                            }
                            className="me-2"
                        />
                        {isViewable(doc.filename)
                            ? 'View document'
                            : 'Download document'}
                    </a>
                )}
                {!done && !readOnly && (
                    <button
                        type="button"
                        className="row-drop"
                        onClick={() => input.current.click()}
                    >
                        <FontAwesomeIcon
                            icon={faCloudArrowUp}
                            className="icon"
                        />
                        <span>
                            <strong>Drop file here</strong>
                            <span className="sub">or click to upload</span>
                        </span>
                    </button>
                )}
                {done && user.isSuper && !readOnly && (
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

            <UploadConfirm
                task={task}
                files={pending}
                onCancel={() => setPending([])}
                onConfirm={upload}
            />
        </div>
    );
}

FormRow.propTypes = {
    task: PropTypes.object.isRequired,
    users: PropTypes.array.isRequired,
    onChanged: PropTypes.func.isRequired,
    readOnly: PropTypes.bool,
};

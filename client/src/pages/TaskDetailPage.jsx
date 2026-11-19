import { useRef, useState } from 'react';
import PropTypes from 'prop-types';
import { Link, useParams } from 'react-router-dom';
import Alert from 'react-bootstrap/Alert';
import Button from 'react-bootstrap/Button';
import Form from 'react-bootstrap/Form';
import { FontAwesomeIcon } from '@fortawesome/react-fontawesome';
import {
    faDownload,
    faLock,
    faPaperclip,
    faCloudArrowUp,
} from '@fortawesome/free-solid-svg-icons';
import { api } from '../api';
import { useAuth, useLoad } from '../hooks';
import { formLabel, formatDateTime, timeAgo } from '../format';
import { AttachmentIcon } from '../components/AttachmentIcon';
import {
    ACCEPT_ATTRIBUTE,
    checkFiles,
    formatFileSize,
    uploadForm,
} from '../components/files';
import { announceAssignment, useToast } from '../toastContext';
import { UploadConfirm } from '../components/UploadConfirm';
import { HistoryTimeline } from '../components/HistoryTimeline';
import { StateControl } from '../components/StateControl';
import {
    BackLink,
    DueDate,
    EmptyState,
    InactiveBadge,
    LoadError,
    PageLoader,
    ReadField,
} from '../components/ui';

export function TaskDetailPage() {
    const { id } = useParams();
    const { data, error, reload, setData } = useLoad(
        () => api.get(`/tasks/${id}`),
        [id],
    );
    const users = useLoad(() => api.get('/users'));

    if (error) return <LoadError error={error} onRetry={reload} />;
    if (!data || !users.data) return <PageLoader />;
    return <TaskDetail task={data} users={users.data} onUpdate={setData} />;
}

function TaskDetail({ task, users, onUpdate }) {
    const { notifyChange } = useAuth();
    const showToast = useToast();

    const update = async (changes) => {
        const updated = await api.patch(`/tasks/${task.id}`, changes);
        announceAssignment(showToast, updated.assignmentEmail);
        onUpdate(updated);
        notifyChange();
    };

    // Tasks of an inactive application are read-only; once the application
    // is submitted, the owner and notes are fixed.
    const locked = task.projectActive === false;
    const detailsLocked = locked || task.projectState !== 'todo';
    const uploading = !locked && task.state === 'todo' && task.active;
    const hasFiles = task.attachments.length > 0;
    const files = (
        <div className={hasFiles ? 'detail-grid' : ''}>
            {!locked && <AddFiles task={task} onUploaded={onUpdate} />}
            {hasFiles && <CurrentFiles attachments={task.attachments} />}
        </div>
    );

    return (
        <>
            <BackLink to={`/projects/${task.projectId}`}>Back</BackLink>
            <div className="page-header">
                <div>
                    <div className="eyebrow">
                        Task <span className="text-none">{task.code}</span>
                    </div>
                    <h1>{task.name}</h1>
                </div>
                {!locked && (
                    <StateControl
                        state={task.state}
                        what="task"
                        onChange={(state) => update({ state })}
                        autoComplete
                    />
                )}
            </div>

            {!task.active && (
                <div className="inactive-banner mb-4">
                    <InactiveBadge label="Not needed" />
                    {/gas/i.test(task.name)
                        ? "This document isn't needed because the home doesn't heat with natural gas. It comes back automatically if that answer changes."
                        : "This document isn't needed for this project."}
                </div>
            )}

            {task.projectActive === false && (
                <div className="inactive-banner mb-4">
                    <InactiveBadge label="Inactive project" />
                    This task belongs to an inactive application, so it
                    can&apos;t be edited.
                </div>
            )}

            {uploading && <div className="mb-4">{files}</div>}

            <div className="detail-grid mb-4">
                <div>
                    <section className="panel">
                        <div className="panel-title">
                            <h2>Task details</h2>
                        </div>
                        <TaskForm
                            key={task.history[0]?.id}
                            task={task}
                            users={users}
                            onSave={update}
                            readOnly={detailsLocked}
                        >
                            <div className="field-list mb-3">
                                <ReadField label="Project">
                                    <Link to={`/projects/${task.projectId}`}>
                                        #{task.projectId} · {task.customerName}
                                    </Link>
                                </ReadField>
                                <ReadField label="Address">
                                    {task.address}
                                </ReadField>
                                <ReadField label="Due">
                                    <DueDate
                                        date={task.dueDate}
                                        state={task.state}
                                    />
                                </ReadField>
                            </div>
                        </TaskForm>
                    </section>
                </div>
                <section className="panel history-panel">
                    <div className="panel-title">
                        <h2>History</h2>
                        <span className="text-muted small">Newest first</span>
                    </div>
                    <HistoryTimeline entries={task.history} scroll />
                </section>
            </div>

            {!uploading && files}
        </>
    );
}

TaskDetail.propTypes = {
    task: PropTypes.object.isRequired,
    users: PropTypes.array.isRequired,
    onUpdate: PropTypes.func.isRequired,
};

// Owner sits at the top, then `children` (the task's read-only facts),
// then the notes.
function TaskForm({ task, users, onSave, readOnly, children }) {
    const initial = { ownerId: String(task.owner.id), notes: task.notes };
    const [values, setValues] = useState(initial);
    const [saving, setSaving] = useState(false);
    const [error, setError] = useState(null);

    const changed = Object.fromEntries(
        Object.entries(values).filter(([key, value]) => value !== initial[key]),
    );
    const dirty = Object.keys(changed).length > 0;
    const set = (key) => (e) =>
        setValues((v) => ({ ...v, [key]: e.target.value }));

    const save = async (e) => {
        e.preventDefault();
        setSaving(true);
        setError(null);
        try {
            await onSave({
                ...changed,
                ...('ownerId' in changed && {
                    ownerId: Number(changed.ownerId),
                }),
            });
        } catch (err) {
            setError(err.message);
            setSaving(false);
        }
    };

    const ownerOptions = users.some((u) => u.id === task.owner.id)
        ? users
        : [...users, { id: task.owner.id, displayName: task.owner.name }];

    return (
        <Form onSubmit={save}>
            <fieldset disabled={readOnly}>
                <Form.Group className="mb-3" controlId="ownerId">
                    <Form.Label>Owner</Form.Label>
                    <Form.Select
                        value={values.ownerId}
                        onChange={set('ownerId')}
                    >
                        {ownerOptions.map((u) => (
                            <option key={u.id} value={u.id}>
                                {u.displayName}
                            </option>
                        ))}
                    </Form.Select>
                    {'ownerId' in changed && (
                        <Form.Text>
                            They&apos;ll get an email when you save.
                        </Form.Text>
                    )}
                </Form.Group>
                {children}
                <Form.Group controlId="notes">
                    <Form.Label>Notes</Form.Label>
                    <Form.Control
                        as="textarea"
                        rows={4}
                        value={values.notes}
                        onChange={set('notes')}
                        maxLength={5000}
                        placeholder="Notes about this task…"
                    />
                </Form.Group>
                {error && (
                    <Alert variant="danger" className="mt-3 mb-0">
                        {error}
                    </Alert>
                )}
                <div className="save-bar" hidden={readOnly}>
                    <span className="hint">{dirty && 'Unsaved changes'}</span>
                    <Button
                        variant="light"
                        disabled={!dirty || saving}
                        onClick={() => setValues(initial)}
                    >
                        Cancel
                    </Button>
                    <Button type="submit" disabled={!dirty || saving}>
                        {saving ? 'Saving…' : 'Save'}
                    </Button>
                </div>
            </fieldset>
        </Form>
    );
}

TaskForm.propTypes = {
    task: PropTypes.object.isRequired,
    readOnly: PropTypes.bool,
    users: PropTypes.array.isRequired,
    onSave: PropTypes.func.isRequired,
    children: PropTypes.node,
};

// Upload area for the task's form: choosing or dropping files opens the
// "Is this the right document?" popup. Once the task is done, only the
// super user can add a new version.
function AddFiles({ task, onUploaded }) {
    const { user, notifyChange } = useAuth();
    const input = useRef(null);
    const [pending, setPending] = useState([]);
    const [dragging, setDragging] = useState(false);
    const [error, setError] = useState(null);

    if (task.state === 'done' && !user.isSuper)
        return (
            <section className="panel">
                <EmptyState icon={faLock}>
                    Uploaded. Only an admin can replace it.
                </EmptyState>
            </section>
        );

    const choose = (fileList) => {
        const { accepted, error } = checkFiles(fileList);
        setError(error);
        if (accepted.length) setPending(accepted);
    };

    const upload = async () => {
        onUploaded(await uploadForm(task, pending));
        setPending([]);
        setError(null);
        notifyChange();
    };

    return (
        <section className="panel">
            <div className="panel-title">
                <h2>Upload the {formLabel(task.name)}</h2>
            </div>
            <button
                type="button"
                className={`task-drop ${dragging ? 'dragging' : ''}`}
                onClick={() => input.current.click()}
                onDragOver={(e) => {
                    e.preventDefault();
                    setDragging(true);
                }}
                onDragLeave={(e) => {
                    if (!e.currentTarget.contains(e.relatedTarget))
                        setDragging(false);
                }}
                onDrop={(e) => {
                    e.preventDefault();
                    setDragging(false);
                    choose(e.dataTransfer.files);
                }}
            >
                <FontAwesomeIcon icon={faCloudArrowUp} className="icon" />
                <strong>Drop files here or click to browse</strong>
                <small>PDF, photo or Office file · max 20 MB</small>
            </button>
            <input
                ref={input}
                type="file"
                multiple
                hidden
                accept={ACCEPT_ATTRIBUTE}
                onChange={(e) => {
                    choose(e.target.files);
                    e.target.value = '';
                }}
            />
            {error && <div className="small text-danger mt-2">{error}</div>}
            <UploadConfirm
                task={task}
                customerName={task.customerName}
                files={pending}
                onCancel={() => setPending([])}
                onConfirm={upload}
            />
        </section>
    );
}

AddFiles.propTypes = {
    task: PropTypes.object.isRequired,
    onUploaded: PropTypes.func.isRequired,
};

function CurrentFiles({ attachments }) {
    return (
        <section className="panel">
            <div className="panel-title">
                <h2>
                    Uploaded Documents
                    <span className="count">{attachments.length}</span>
                </h2>
            </div>
            {attachments.length ? (
                <ul className="file-list">
                    {attachments.map((file) => (
                        <li key={file.id}>
                            <span className="file-icon">
                                <AttachmentIcon mimeType={file.mimeType} />
                            </span>
                            <div className="file-main">
                                <a
                                    href={`/api/attachments/${file.id}`}
                                    target="_blank"
                                    rel="noopener noreferrer"
                                >
                                    {file.filename}
                                </a>
                                <div className="file-meta">
                                    {formatFileSize(file.size)} ·{' '}
                                    {file.uploadedBy} ·{' '}
                                    <span
                                        title={formatDateTime(file.createdAt)}
                                    >
                                        {timeAgo(file.createdAt)}
                                    </span>
                                </div>
                            </div>
                            <a
                                href={`/api/attachments/${file.id}?download=1`}
                                className="btn btn-light btn-sm"
                                aria-label={`Download ${file.filename}`}
                                title="Download"
                            >
                                <FontAwesomeIcon icon={faDownload} />
                            </a>
                        </li>
                    ))}
                </ul>
            ) : (
                <EmptyState icon={faPaperclip}>No files yet.</EmptyState>
            )}
        </section>
    );
}

CurrentFiles.propTypes = { attachments: PropTypes.array.isRequired };

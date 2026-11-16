import { useState } from 'react';
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
    faUpload,
} from '@fortawesome/free-solid-svg-icons';
import { api } from '../api';
import { useAuth, useLoad } from '../hooks';
import { formLabel, formatDateTime, timeAgo } from '../format';
import { AttachmentIcon } from '../components/AttachmentIcon';
import { FileDropZone } from '../components/FileDropZone';
import { formatFileSize, uploadForm } from '../components/files';
import { ConfirmFormUpload } from '../components/FormRow';
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

    const update = async (changes) => {
        onUpdate(await api.patch(`/tasks/${task.id}`, changes));
        notifyChange();
    };

    const files = (
        <div className="detail-grid">
            <AddFiles task={task} onUploaded={onUpdate} />
            <CurrentFiles attachments={task.attachments} />
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
                <StateControl
                    state={task.state}
                    what="task"
                    onChange={(state) => update({ state })}
                    doneHint="Completes when the form is uploaded"
                />
            </div>

            {task.projectActive === false && (
                <div className="inactive-banner mb-4">
                    <InactiveBadge label="Inactive project" />
                    This task belongs to an inactive project.
                </div>
            )}

            {task.state === 'todo' && (
                <>
                    <div className="next-step mb-4">
                        <FontAwesomeIcon icon={faUpload} className="icon" />
                        <div>
                            <strong>
                                Upload the {formLabel(task.name)} to complete
                                this task.
                            </strong>
                            <div>
                                Drag and drop the file into the box below, or
                                click it to choose a file.
                            </div>
                        </div>
                    </div>
                    <div className="mb-4">{files}</div>
                </>
            )}

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
                        >
                            <div className="field-list mb-3">
                                <ReadField label="Project">
                                    <Link to={`/projects/${task.projectId}`}>
                                        #{task.projectId} · {task.customerName}
                                    </Link>
                                </ReadField>
                                <ReadField label="Customer Name">
                                    {task.customerName}
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
                <section className="panel">
                    <div className="panel-title">
                        <h2>History</h2>
                    </div>
                    <HistoryTimeline entries={task.history} scroll />
                </section>
            </div>

            {task.state === 'done' && files}
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
function TaskForm({ task, users, onSave, children }) {
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
            <Form.Group className="mb-3" controlId="ownerId">
                <Form.Label>Owner</Form.Label>
                <Form.Select value={values.ownerId} onChange={set('ownerId')}>
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
            <div className="save-bar">
                <span className="hint">
                    {dirty ? 'You have unsaved changes.' : 'All changes saved.'}
                </span>
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
        </Form>
    );
}

TaskForm.propTypes = {
    task: PropTypes.object.isRequired,
    users: PropTypes.array.isRequired,
    onSave: PropTypes.func.isRequired,
    children: PropTypes.node,
};

// Upload area for the task's form. Uploading completes the task, so it
// asks first; once done, only the super user can add a new version.
function AddFiles({ task, onUploaded }) {
    const { user, notifyChange } = useAuth();
    const [files, setFiles] = useState([]);
    const [confirming, setConfirming] = useState(false);
    const [error, setError] = useState(null);

    if (task.state === 'done' && !user.isSuper)
        return (
            <section className="panel">
                <div className="panel-title">
                    <h2>Upload the {formLabel(task.name)}</h2>
                </div>
                <EmptyState icon={faLock}>
                    The form is uploaded and this task is done. Only the super
                    user can replace it.
                </EmptyState>
            </section>
        );

    const upload = async () => {
        onUploaded(await uploadForm(task, files));
        setFiles([]);
        setError(null);
        notifyChange();
    };

    return (
        <section className="panel">
            <div className="panel-title">
                <h2>Upload the {formLabel(task.name)}</h2>
            </div>
            <FileDropZone
                files={files}
                onFilesChange={(next) => {
                    setFiles(next);
                    setError(null);
                }}
            />
            {error && <Alert variant="danger">{error}</Alert>}
            <Button
                className="w-100"
                onClick={() => setConfirming(true)}
                disabled={!files.length}
            >
                <FontAwesomeIcon icon={faUpload} className="me-2" />
                Upload
            </Button>
            <ConfirmFormUpload
                task={task}
                files={confirming ? files : []}
                onHide={() => setConfirming(false)}
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

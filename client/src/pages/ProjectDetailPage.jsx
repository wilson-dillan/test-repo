import { useState } from 'react';
import PropTypes from 'prop-types';
import { useNavigate, useParams } from 'react-router-dom';
import Alert from 'react-bootstrap/Alert';
import Button from 'react-bootstrap/Button';
import Form from 'react-bootstrap/Form';
import { FontAwesomeIcon } from '@fortawesome/react-fontawesome';
import {
    faDownload,
    faTrashCan,
    faFolderOpen,
    faNoteSticky,
} from '@fortawesome/free-solid-svg-icons';
import { api } from '../api';
import { useAuth, useLoad } from '../hooks';
import { formatDateTime, timeAgo } from '../format';
import { FormRow } from '../components/FormRow';
import { ConfirmModal } from '../components/ConfirmModal';
import { HistoryTimeline } from '../components/HistoryTimeline';
import { ActiveControl, StateControl } from '../components/StateControl';
import {
    Avatar,
    BackLink,
    DueDate,
    EmptyState,
    InactiveBadge,
    LoadError,
    PageLoader,
} from '../components/ui';

export function ProjectDetailPage() {
    const { id } = useParams();
    const { data, error, reload, setData } = useLoad(
        () => api.get(`/projects/${id}`),
        [id],
    );
    const users = useLoad(() => api.get('/users'));

    if (error) return <LoadError error={error} onRetry={reload} />;
    if (!data || !users.data) return <PageLoader />;
    return (
        <ProjectDetail
            project={data}
            users={users.data}
            onUpdate={setData}
            reload={reload}
        />
    );
}

function ProjectDetail({ project, users, onUpdate, reload }) {
    const { user, notifyChange } = useAuth();
    const fileCount = project.tasks.reduce((n, t) => n + t.attachmentCount, 0);

    const update = async (changes) => {
        onUpdate(await api.patch(`/projects/${project.id}`, changes));
        notifyChange();
    };

    return (
        <>
            <BackLink to="/">Back</BackLink>
            <div className="page-header">
                <div>
                    <div className="eyebrow">
                        Project #{project.id} · {project.typeLabel}
                    </div>
                    <h1>{project.customerName}</h1>
                    <div className="mt-2">
                        <DueDate
                            date={project.dueDate}
                            state={project.state}
                            prefix="Due "
                        />
                    </div>
                </div>
                <div className="d-flex flex-wrap align-items-center gap-3">
                    <ActiveControl
                        active={project.active}
                        onChange={(active) => update({ active })}
                    />
                    <StateControl
                        state={project.state}
                        what="project"
                        onChange={(state) => update({ state })}
                    />
                </div>
            </div>

            {!project.active && (
                <div className="inactive-banner mb-4">
                    <InactiveBadge />
                    This project is inactive. It stays listed and can still be
                    viewed and edited.
                </div>
            )}

            <div className="detail-grid mb-4">
                <ProjectForm
                    key={project.history[0]?.id}
                    project={project}
                    users={users}
                    onSave={update}
                />
                <section className="panel">
                    <div className="panel-title">
                        <h2>History</h2>
                    </div>
                    <HistoryTimeline
                        entries={project.history}
                        showTarget
                        scroll
                    />
                </section>
            </div>

            <section className="panel">
                <div className="panel-title flex-wrap">
                    <h2>
                        Linked Tasks
                        <span className="count">
                            {
                                project.tasks.filter((t) => t.state === 'done')
                                    .length
                            }{' '}
                            of {project.tasks.length} forms uploaded
                        </span>
                    </h2>
                    <a
                        href={`/api/projects/${project.id}/documents.zip`}
                        className={`btn btn-outline-primary btn-sm ${fileCount ? '' : 'disabled'}`}
                        aria-disabled={!fileCount}
                        download
                    >
                        <FontAwesomeIcon icon={faDownload} className="me-2" />
                        Download all documents ({fileCount})
                    </a>
                </div>
                <div className="form-rows">
                    {project.tasks.map((task) => (
                        <FormRow
                            key={task.id}
                            task={task}
                            users={users}
                            onChanged={reload}
                        />
                    ))}
                </div>
            </section>

            <Notes project={project} onAdded={reload} />

            {user.isSuper && <DeleteProject project={project} />}
        </>
    );
}

ProjectDetail.propTypes = {
    project: PropTypes.object.isRequired,
    users: PropTypes.array.isRequired,
    onUpdate: PropTypes.func.isRequired,
    reload: PropTypes.func.isRequired,
};

function ProjectForm({ project, users, onSave }) {
    const initial = {
        customerName: project.customerName,
        address: project.address,
        dueDate: project.dueDate || '',
        ownerId: String(project.owner.id),
    };
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
                ...('dueDate' in changed && {
                    dueDate: changed.dueDate || null,
                }),
            });
        } catch (err) {
            setError(err.message);
            setSaving(false);
        }
    };

    // The owner list includes the current owner even if deactivated.
    const ownerOptions = users.some((u) => u.id === project.owner.id)
        ? users
        : [...users, { id: project.owner.id, displayName: project.owner.name }];

    return (
        <Form className="panel" onSubmit={save}>
            <div className="panel-title">
                <h2>Project details</h2>
            </div>
            <div className="field-list">
                <Form.Group className="full" controlId="ownerId">
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
                </Form.Group>
                <Form.Group className="full" controlId="customerName">
                    <Form.Label>Customer Name</Form.Label>
                    <Form.Control
                        value={values.customerName}
                        onChange={set('customerName')}
                        maxLength={200}
                        required
                    />
                </Form.Group>
                <Form.Group className="full" controlId="address">
                    <Form.Label>Address</Form.Label>
                    <Form.Control
                        value={values.address}
                        onChange={set('address')}
                        maxLength={300}
                        required
                    />
                </Form.Group>
                <Form.Group controlId="dueDate">
                    <Form.Label>Due Date</Form.Label>
                    <Form.Control
                        type="date"
                        value={values.dueDate}
                        onChange={set('dueDate')}
                    />
                </Form.Group>
            </div>
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

ProjectForm.propTypes = {
    project: PropTypes.object.isRequired,
    users: PropTypes.array.isRequired,
    onSave: PropTypes.func.isRequired,
};

function Notes({ project, onAdded }) {
    const [body, setBody] = useState('');
    const [saving, setSaving] = useState(false);
    const [error, setError] = useState(null);

    const add = async (e) => {
        e.preventDefault();
        setSaving(true);
        setError(null);
        try {
            await api.post(`/projects/${project.id}/notes`, { body });
            setBody('');
            onAdded();
        } catch (err) {
            setError(err.message);
        } finally {
            setSaving(false);
        }
    };

    return (
        <section className="panel">
            <div className="panel-title">
                <h2>
                    Notes<span className="count">{project.notes.length}</span>
                </h2>
            </div>
            <Form onSubmit={add} className="mb-4">
                <Form.Control
                    as="textarea"
                    rows={3}
                    placeholder="Add a note for the team…"
                    value={body}
                    onChange={(e) => setBody(e.target.value)}
                    maxLength={2000}
                    aria-label="New note"
                />
                {error && (
                    <Alert variant="danger" className="mt-2 mb-0">
                        {error}
                    </Alert>
                )}
                <div className="d-flex justify-content-end mt-2">
                    <Button type="submit" disabled={!body.trim() || saving}>
                        <FontAwesomeIcon icon={faNoteSticky} className="me-2" />
                        {saving ? 'Adding…' : 'Add note'}
                    </Button>
                </div>
            </Form>
            {project.notes.length ? (
                project.notes.map((note) => (
                    <div className="note" key={note.id}>
                        <Avatar name={note.author} />
                        <div className="bubble">
                            <div className="who">
                                <strong>{note.author}</strong> ·{' '}
                                <span title={formatDateTime(note.createdAt)}>
                                    {timeAgo(note.createdAt)}
                                </span>
                            </div>
                            <div className="body">{note.body}</div>
                        </div>
                    </div>
                ))
            ) : (
                <EmptyState icon={faFolderOpen}>No notes yet.</EmptyState>
            )}
        </section>
    );
}

Notes.propTypes = {
    project: PropTypes.object.isRequired,
    onAdded: PropTypes.func.isRequired,
};

// Super user only: removes the project and everything in it for good.
// Regular users can only set a project inactive.
function DeleteProject({ project }) {
    const { notifyChange } = useAuth();
    const navigate = useNavigate();
    const [confirming, setConfirming] = useState(false);

    return (
        <section className="panel danger-zone">
            <div>
                <h2>Delete project</h2>
                <p className="text-muted mb-0">
                    Permanently removes this project, its forms, uploaded
                    documents, notes and history. Only you can see this.
                </p>
            </div>
            <Button
                variant="outline-danger"
                onClick={() => setConfirming(true)}
            >
                <FontAwesomeIcon icon={faTrashCan} className="me-2" />
                Delete project
            </Button>
            <ConfirmModal
                show={confirming}
                onHide={() => setConfirming(false)}
                onConfirm={async () => {
                    await api.del(`/projects/${project.id}`);
                    notifyChange();
                    navigate('/', { replace: true });
                }}
                icon={faTrashCan}
                title={`Delete project #${project.id} (${project.customerName})?`}
                confirmLabel="Delete forever"
                confirmVariant="danger"
            >
                This permanently deletes the project and everything in it,
                including uploaded documents and history. It can&apos;t be
                undone or recovered.
            </ConfirmModal>
        </section>
    );
}

DeleteProject.propTypes = { project: PropTypes.object.isRequired };

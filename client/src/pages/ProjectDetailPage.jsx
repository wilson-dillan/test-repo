import { useState } from 'react';
import PropTypes from 'prop-types';
import { useNavigate, useParams } from 'react-router-dom';
import Alert from 'react-bootstrap/Alert';
import Button from 'react-bootstrap/Button';
import Form from 'react-bootstrap/Form';
import { FontAwesomeIcon } from '@fortawesome/react-fontawesome';
import {
    faArrowUpRightFromSquare,
    faDownload,
    faFolderOpen,
    faLock,
    faNoteSticky,
    faPen,
    faTrashCan,
} from '@fortawesome/free-solid-svg-icons';
import { api } from '../api';
import { useAuth, useLoad } from '../hooks';
import {
    formatDate,
    formatDateTime,
    formatMoney,
    ownerChoices,
    timeAgo,
} from '../format';
import { FormRow } from '../components/FormRow';
import { ProjectQuestions } from '../components/ProjectQuestions';
import {
    BLANK_ANSWERS,
    answerPayload,
    answerProblem,
    asks,
    describeControls,
    describeFinancing,
} from '../components/questionRules';
import { ConfirmModal } from '../components/ConfirmModal';
import { HistoryTimeline } from '../components/HistoryTimeline';
import { ActiveControl } from '../components/StateControl';
import { StageControl } from '../components/StageControl';
import {
    Avatar,
    BackLink,
    DueDate,
    EmptyState,
    InactiveBadge,
    LoadError,
    Owner,
    PageLoader,
    ReadField,
} from '../components/ui';

export function ProjectDetailPage() {
    const { id } = useParams();
    const { data, error, reload, setData } = useLoad(
        () => api.get(`/projects/${id}`),
        [id],
    );
    const meta = useLoad(() =>
        Promise.all([
            api.get('/users'),
            api.get('/projects/types'),
            api.get('/projects/options'),
        ]),
    );

    if (error) return <LoadError error={error} onRetry={reload} />;
    if (!data || !meta.data) return <PageLoader />;
    const [users, types, options] = meta.data;
    return (
        <ProjectDetail
            project={data}
            users={users}
            type={types.find((t) => t.id === data.type)}
            options={options}
            onUpdate={setData}
            reload={reload}
        />
    );
}

function ProjectDetail({ project, users, type, options, onUpdate, reload }) {
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
                    <div className="mt-2 d-flex flex-wrap gap-3 align-items-center">
                        <DueDate
                            date={project.dueDate}
                            state={project.state}
                            prefix="Due "
                        />
                        {project.housecallUrl && (
                            <a
                                href={project.housecallUrl}
                                target="_blank"
                                rel="noopener noreferrer"
                                className="small fw-semibold"
                            >
                                View in Housecall Pro
                                <FontAwesomeIcon
                                    icon={faArrowUpRightFromSquare}
                                    className="ms-1"
                                />
                            </a>
                        )}
                    </div>
                </div>
                <div className="d-flex flex-wrap align-items-center gap-3">
                    <ActiveControl
                        active={project.active}
                        canDiscard={project.state === 'todo'}
                        onChange={(active) => update({ active })}
                    />
                    <StageControl project={project} onChanged={onUpdate} />
                </div>
            </div>

            {!project.active && (
                <div className="inactive-banner mb-4">
                    <InactiveBadge />
                    This application is inactive. It stays listed but can&apos;t
                    be edited.
                </div>
            )}

            <div className="detail-grid mb-4">
                <ProjectDetailsCard
                    key={project.history[0]?.id}
                    project={project}
                    users={users}
                    type={type}
                    options={options}
                    onSave={update}
                />
                <section className="panel history-panel">
                    <div className="panel-title">
                        <h2>History</h2>
                        <span className="text-muted small">Newest first</span>
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
                                project.tasks.filter(
                                    (t) => t.active && t.state === 'done',
                                ).length
                            }{' '}
                            of {project.tasks.filter((t) => t.active).length}{' '}
                            documents uploaded
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
                    {/* Documents this project doesn't need (e.g. the gas bill
                        without gas heat) are hidden; their uploads are kept. */}
                    {project.tasks
                        .filter((task) => task.active)
                        .map((task) => (
                            <FormRow
                                key={task.id}
                                task={task}
                                customerName={project.customerName}
                                users={users}
                                onChanged={reload}
                                readOnly={!project.active}
                                detailsLocked={project.state !== 'todo'}
                            />
                        ))}
                </div>
            </section>

            <Notes project={project} onAdded={reload} />

            {user.isSuper && project.state === 'todo' && (
                <DeleteProject project={project} />
            )}
        </>
    );
}

ProjectDetail.propTypes = {
    project: PropTypes.object.isRequired,
    users: PropTypes.array.isRequired,
    type: PropTypes.object,
    options: PropTypes.object.isRequired,
    onUpdate: PropTypes.func.isRequired,
    reload: PropTypes.func.isRequired,
};

const ANSWER_KEYS = Object.keys(BLANK_ANSWERS);

function ProjectForm({ project, users, type, options, onSave, onCancel }) {
    const initial = {
        customerFirstName: project.customerFirstName,
        customerLastName: project.customerLastName,
        address: project.address,
        dueDate: project.dueDate || '',
        ownerId: String(project.owner.id),
        financing: project.financing,
        financingProvider: project.financingProvider || '',
        financingOther: project.financingOther || '',
        heatsWithGas: project.heatsWithGas,
        integratedControls: project.integratedControls,
        controlsType: project.controlsType || '',
        controlsOther: project.controlsOther || '',
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
    const setAnswer = (key, value) =>
        setValues((v) => ({ ...v, [key]: value }));
    const answersChanged = ANSWER_KEYS.some((k) => k in changed);

    const save = async (e) => {
        e.preventDefault();
        const problem = answersChanged && answerProblem(type, values);
        if (problem) {
            setError(problem);
            return;
        }
        setSaving(true);
        setError(null);
        const fieldChanges = Object.fromEntries(
            Object.entries(changed).filter(([k]) => !ANSWER_KEYS.includes(k)),
        );
        try {
            await onSave({
                ...fieldChanges,
                ...(answersChanged && answerPayload(type, values)),
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

    const ownerOptions = ownerChoices(users, project.owner);

    return (
        <Form className="panel" onSubmit={save}>
            <div className="panel-title">
                <h2>Edit project details</h2>
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
                <Form.Group controlId="customerFirstName">
                    <Form.Label>First Name</Form.Label>
                    <Form.Control
                        value={values.customerFirstName}
                        onChange={set('customerFirstName')}
                        maxLength={100}
                        required
                    />
                </Form.Group>
                <Form.Group controlId="customerLastName">
                    <Form.Label>Last Name</Form.Label>
                    <Form.Control
                        value={values.customerLastName}
                        onChange={set('customerLastName')}
                        maxLength={100}
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
            <div className="mt-4">
                <ProjectQuestions
                    type={type}
                    values={values}
                    onChange={setAnswer}
                    options={options}
                />
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
                <Button variant="light" disabled={saving} onClick={onCancel}>
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
    type: PropTypes.object,
    options: PropTypes.object.isRequired,
    onSave: PropTypes.func.isRequired,
    onCancel: PropTypes.func.isRequired,
};

// Shows the project's details as plain text; "Edit" switches to the form.
// Saving remounts this card (it's keyed on the latest history entry),
// which returns it to the read view.
function ProjectDetailsCard({ project, users, type, options, onSave }) {
    const [editing, setEditing] = useState(false);
    if (editing)
        return (
            <ProjectForm
                project={project}
                users={users}
                type={type}
                options={options}
                onSave={onSave}
                onCancel={() => setEditing(false)}
            />
        );

    return (
        <section className="panel">
            <div className="panel-title">
                <h2>Project details</h2>
                {project.active && project.state !== 'todo' && (
                    <span className="locked-note">
                        <FontAwesomeIcon icon={faLock} className="me-1" />
                        Locked after submitting
                    </span>
                )}
                {project.active && project.state === 'todo' && (
                    <Button
                        variant="outline-primary"
                        size="sm"
                        onClick={() => setEditing(true)}
                    >
                        <FontAwesomeIcon icon={faPen} className="me-2" />
                        Edit
                    </Button>
                )}
            </div>
            <div className="field-list">
                <ReadField label="Owner">
                    <Owner name={project.owner.name} />
                </ReadField>
                <ReadField label="Due date">
                    <DueDate date={project.dueDate} state={project.state} />
                </ReadField>
                <ReadField label="Customer">{project.customerName}</ReadField>
                <ReadField label="Address">{project.address}</ReadField>
                {asks(type, 'heats_with_gas') && (
                    <ReadField label="Gas bill needed">
                        {project.heatsWithGas
                            ? 'Yes (heats with natural gas)'
                            : 'No'}
                    </ReadField>
                )}
                {asks(type, 'integrated_controls') && (
                    <ReadField label="Integrated controls">
                        {describeControls(project)}
                    </ReadField>
                )}
                <ReadField label="Financing">
                    {describeFinancing(project)}
                </ReadField>
                {project.submittedAt && (
                    <ReadField label="Submitted">
                        {formatDateTime(project.submittedAt)}
                    </ReadField>
                )}
                {project.state === 'done' && (
                    <ReadField label="Rebate received" className="full">
                        #{project.rebateNumber} ·{' '}
                        {formatMoney(project.rebateAmount)} · received{' '}
                        {formatDate(project.rebateReceivedOn)}
                    </ReadField>
                )}
            </div>
        </section>
    );
}

ProjectDetailsCard.propTypes = {
    project: PropTypes.object.isRequired,
    users: PropTypes.array.isRequired,
    type: PropTypes.object,
    options: PropTypes.object.isRequired,
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
            {project.active && (
                <Form onSubmit={add} className="mb-3">
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
                            <FontAwesomeIcon
                                icon={faNoteSticky}
                                className="me-2"
                            />
                            {saving ? 'Adding…' : 'Add note'}
                        </Button>
                    </div>
                </Form>
            )}
            {project.notes.length ? (
                <div className="notes-list">
                    {project.notes.map((note) => (
                        <div className="note" key={note.id}>
                            <Avatar name={note.author} />
                            <div className="bubble">
                                <div className="who">
                                    <strong>{note.author}</strong> ·{' '}
                                    <span
                                        title={formatDateTime(note.createdAt)}
                                    >
                                        {timeAgo(note.createdAt)}
                                    </span>
                                </div>
                                <div className="body">{note.body}</div>
                            </div>
                        </div>
                    ))}
                </div>
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

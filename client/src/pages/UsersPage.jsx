import { useState } from 'react';
import PropTypes from 'prop-types';
import Alert from 'react-bootstrap/Alert';
import Button from 'react-bootstrap/Button';
import Form from 'react-bootstrap/Form';
import Modal from 'react-bootstrap/Modal';
import { FontAwesomeIcon } from '@fortawesome/react-fontawesome';
import {
    faEnvelope,
    faPenToSquare,
    faTriangleExclamation,
    faUserPlus,
    faUserShield,
} from '@fortawesome/free-solid-svg-icons';
import { api } from '../api';
import { useAuth, useLoad } from '../hooks';
import { Avatar, LoadError, PageLoader } from '../components/ui';

export function UsersPage() {
    const { user: me } = useAuth();
    const { data: users, error, reload } = useLoad(() => api.get('/users'));
    const [editing, setEditing] = useState(null); // null | 'new' | user
    const [testing, setTesting] = useState(false);
    // { variant, text } shown above the table after an action
    const [notice, setNotice] = useState(null);

    return (
        <>
            <div className="page-header">
                <div>
                    <div className="eyebrow">Admin</div>
                    <h1>Users</h1>
                    <div className="text-muted mt-1">
                        Add logins for your team, reset passwords and manage
                        access.
                    </div>
                </div>
                <div className="d-flex gap-2 flex-wrap">
                    <Button
                        variant="outline-primary"
                        onClick={() => setTesting(true)}
                    >
                        <FontAwesomeIcon icon={faEnvelope} className="me-2" />
                        Send test email
                    </Button>
                    <Button onClick={() => setEditing('new')}>
                        <FontAwesomeIcon icon={faUserPlus} className="me-2" />
                        Add user
                    </Button>
                </div>
            </div>

            {notice && (
                <Alert
                    variant={notice.variant}
                    dismissible
                    onClose={() => setNotice(null)}
                >
                    {notice.text}
                </Alert>
            )}
            {error && <LoadError error={error} onRetry={reload} />}
            {!users && !error && <PageLoader />}
            {users && (
                <section className="panel p-0">
                    <div className="table-responsive">
                        <table className="table users-table mb-0">
                            <thead>
                                <tr>
                                    <th className="ps-4">Name</th>
                                    <th>Username</th>
                                    <th>Email</th>
                                    <th>Role</th>
                                    <th>Status</th>
                                    <th />
                                </tr>
                            </thead>
                            <tbody>
                                {users.map((u) => (
                                    <tr
                                        key={u.id}
                                        className={u.active ? '' : 'inactive'}
                                    >
                                        <td className="ps-4">
                                            <span className="owner">
                                                <Avatar name={u.displayName} />
                                                {u.displayName}
                                                {u.id === me.id && (
                                                    <span className="text-muted fw-normal">
                                                        (you)
                                                    </span>
                                                )}
                                            </span>
                                        </td>
                                        <td>{u.username}</td>
                                        <td>
                                            {u.email || (
                                                <span
                                                    className="no-email"
                                                    title="Add an email so they get assignment emails"
                                                >
                                                    <FontAwesomeIcon
                                                        icon={
                                                            faTriangleExclamation
                                                        }
                                                        className="me-1"
                                                    />
                                                    No email, won&apos;t be
                                                    notified
                                                </span>
                                            )}
                                        </td>
                                        <td>
                                            {u.isSuper ? (
                                                <span className="role-badge super">
                                                    <FontAwesomeIcon
                                                        icon={faUserShield}
                                                    />
                                                    Super user
                                                </span>
                                            ) : (
                                                <span className="role-badge">
                                                    Member
                                                </span>
                                            )}
                                        </td>
                                        <td>
                                            {!u.active ? (
                                                'Deactivated'
                                            ) : u.hasPassword ? (
                                                'Active'
                                            ) : (
                                                <span className="no-email">
                                                    Invite pending
                                                </span>
                                            )}
                                        </td>
                                        <td className="text-end pe-4 text-nowrap">
                                            {u.active && u.email && (
                                                <SendLinkButton
                                                    user={u}
                                                    onDone={setNotice}
                                                />
                                            )}
                                            <Button
                                                variant="light"
                                                size="sm"
                                                onClick={() => setEditing(u)}
                                            >
                                                <FontAwesomeIcon
                                                    icon={faPenToSquare}
                                                    className="me-1"
                                                />
                                                Edit
                                            </Button>
                                        </td>
                                    </tr>
                                ))}
                            </tbody>
                        </table>
                    </div>
                </section>
            )}

            <TestEmailModal
                show={testing}
                defaultTo={me.email || ''}
                onHide={() => setTesting(false)}
            />

            <UserModal
                user={editing}
                isSelf={editing?.id === me.id}
                onHide={() => setEditing(null)}
                onSaved={(message) => {
                    setEditing(null);
                    setNotice(message);
                    reload();
                }}
            />
        </>
    );
}

// Emails a fresh invite (if they never set a password) or a reset link.
function SendLinkButton({ user, onDone }) {
    const [busy, setBusy] = useState(false);
    const label = user.hasPassword ? 'Send reset link' : 'Resend invite';

    const send = async () => {
        setBusy(true);
        try {
            const { sentTo } = await api.post(
                `/users/${user.id}/password-link`,
            );
            onDone({
                variant: 'success',
                text: `${user.hasPassword ? 'Reset link' : 'Invite'} sent to ${sentTo}. It lasts 48 hours.`,
            });
        } catch (err) {
            onDone({
                variant: 'danger',
                text: `Couldn't email ${user.displayName}: ${err.message}`,
            });
        } finally {
            setBusy(false);
        }
    };

    return (
        <Button
            variant="outline-primary"
            size="sm"
            className="me-2"
            onClick={send}
            disabled={busy}
        >
            <FontAwesomeIcon icon={faEnvelope} className="me-1" />
            {busy ? 'Sending…' : label}
        </Button>
    );
}

SendLinkButton.propTypes = {
    user: PropTypes.object.isRequired,
    onDone: PropTypes.func.isRequired,
};

// Sends a test message and shows exactly why it failed, if it did.
function TestEmailModal({ show, defaultTo, onHide }) {
    const [to, setTo] = useState(defaultTo);
    const [status, setStatus] = useState(null);

    const send = async (e) => {
        e.preventDefault();
        setStatus({ busy: true });
        try {
            const { sentTo } = await api.post('/users/test-email', { to });
            setStatus({
                ok: `Sent to ${sentTo}. Check that inbox (and spam).`,
            });
        } catch (err) {
            setStatus({ error: err.message });
        }
    };

    return (
        <Modal
            show={show}
            onHide={onHide}
            onEnter={() => {
                setTo(defaultTo);
                setStatus(null);
            }}
            centered
        >
            <Form onSubmit={send}>
                <Modal.Header closeButton>
                    <Modal.Title>Send a test email</Modal.Title>
                </Modal.Header>
                <Modal.Body>
                    <p className="text-muted">
                        Checks that assignment emails can be sent. If it fails,
                        you&apos;ll see why.
                    </p>
                    <Form.Group controlId="testTo">
                        <Form.Label>Send to</Form.Label>
                        <Form.Control
                            type="email"
                            value={to}
                            onChange={(e) => setTo(e.target.value)}
                            required
                            autoFocus
                        />
                    </Form.Group>
                    {status?.ok && (
                        <Alert variant="success" className="mt-3 mb-0">
                            {status.ok}
                        </Alert>
                    )}
                    {status?.error && (
                        <Alert variant="danger" className="mt-3 mb-0">
                            {status.error}
                        </Alert>
                    )}
                </Modal.Body>
                <Modal.Footer>
                    <Button variant="light" onClick={onHide}>
                        Close
                    </Button>
                    <Button type="submit" disabled={status?.busy}>
                        {status?.busy ? 'Sending…' : 'Send test'}
                    </Button>
                </Modal.Footer>
            </Form>
        </Modal>
    );
}

TestEmailModal.propTypes = {
    show: PropTypes.bool,
    defaultTo: PropTypes.string,
    onHide: PropTypes.func.isRequired,
};

function UserModal({ user, isSelf, onHide, onSaved }) {
    const isNew = user === 'new';
    return (
        <Modal show={Boolean(user)} onHide={onHide} centered>
            {user && (
                <UserForm
                    key={isNew ? 'new' : user.id}
                    user={isNew ? null : user}
                    isSelf={isSelf}
                    onHide={onHide}
                    onSaved={onSaved}
                />
            )}
        </Modal>
    );
}

UserModal.propTypes = {
    user: PropTypes.oneOfType([PropTypes.string, PropTypes.object]),
    isSelf: PropTypes.bool,
    onHide: PropTypes.func.isRequired,
    onSaved: PropTypes.func.isRequired,
};

function UserForm({ user, isSelf, onHide, onSaved }) {
    const [values, setValues] = useState({
        displayName: user?.displayName || '',
        username: user?.username || '',
        email: user?.email || '',
        password: '',
        isSuper: user?.isSuper || false,
        active: user?.active ?? true,
    });
    const [saving, setSaving] = useState(false);
    const [error, setError] = useState(null);
    const [manualPassword, setManualPassword] = useState(false);

    const set = (key) => (e) =>
        setValues((v) => ({
            ...v,
            [key]:
                e.target.type === 'checkbox'
                    ? e.target.checked
                    : e.target.value,
        }));

    const save = async (e) => {
        e.preventDefault();
        setSaving(true);
        setError(null);
        try {
            if (user) {
                const { username, password, ...rest } = values; // eslint-disable-line no-unused-vars
                await api.patch(`/users/${user.id}`, {
                    ...rest,
                    ...(password && { password }),
                });
                onSaved({
                    variant: 'success',
                    text: `Saved changes to ${values.displayName}.`,
                });
                return;
            }
            const { password, ...rest } = values;
            const created = await api.post('/users', {
                ...rest,
                ...(manualPassword && { password }),
            });
            onSaved(
                !created.invite
                    ? {
                          variant: 'success',
                          text: `Added ${created.displayName}. Give them their username and password.`,
                      }
                    : created.invite.sent
                      ? {
                            variant: 'success',
                            text: `Added ${created.displayName} and emailed an invite to ${created.email}. The link lasts 48 hours.`,
                        }
                      : {
                            variant: 'warning',
                            text: `Added ${created.displayName}, but the invite email failed: ${created.invite.error} Use "Send invite" to try again.`,
                        },
            );
        } catch (err) {
            setError(err.message);
            setSaving(false);
        }
    };

    return (
        <Form onSubmit={save}>
            <Modal.Header closeButton>
                <Modal.Title>
                    {user ? `Edit ${user.displayName}` : 'Add user'}
                </Modal.Title>
            </Modal.Header>
            <Modal.Body>
                <Form.Group className="mb-3" controlId="displayName">
                    <Form.Label>Name</Form.Label>
                    <Form.Control
                        value={values.displayName}
                        onChange={set('displayName')}
                        placeholder="Shown as “Welcome, …”"
                        maxLength={80}
                        required
                        autoFocus
                    />
                </Form.Group>
                <Form.Group className="mb-3" controlId="username">
                    <Form.Label>Username</Form.Label>
                    <Form.Control
                        value={values.username}
                        onChange={set('username')}
                        disabled={Boolean(user)}
                        autoCapitalize="none"
                        maxLength={40}
                        required
                    />
                    {!user && (
                        <Form.Text>
                            Used to log in. Letters, numbers, dots, dashes or
                            underscores.
                        </Form.Text>
                    )}
                </Form.Group>
                <Form.Group className="mb-3" controlId="email">
                    <Form.Label>Email</Form.Label>
                    <Form.Control
                        type="email"
                        value={values.email}
                        onChange={set('email')}
                        placeholder="For invites and task assignment emails"
                        required={!user && !manualPassword}
                    />
                </Form.Group>
                {!user && !manualPassword && (
                    <Alert variant="info" className="small">
                        We&apos;ll email them a link to create their own
                        password. The link lasts 48 hours.{' '}
                        <Button
                            variant="link"
                            size="sm"
                            className="p-0 align-baseline"
                            onClick={() => setManualPassword(true)}
                        >
                            Set a password myself instead
                        </Button>
                    </Alert>
                )}
                {(user || manualPassword) && (
                    <Form.Group className="mb-3" controlId="password">
                        <Form.Label>
                            {user ? 'Reset password' : 'Password'}
                        </Form.Label>
                        <Form.Control
                            type="password"
                            value={values.password}
                            onChange={set('password')}
                            autoComplete="new-password"
                            minLength={8}
                            required={!user}
                            placeholder={
                                user
                                    ? 'Leave blank to keep the current one'
                                    : ''
                            }
                        />
                        <Form.Text>
                            At least 8 characters.
                            {user && ' Resetting signs them out everywhere.'}
                            {!user && (
                                <>
                                    {' '}
                                    <Button
                                        variant="link"
                                        size="sm"
                                        className="p-0 align-baseline"
                                        onClick={() => {
                                            setManualPassword(false);
                                            setValues((v) => ({
                                                ...v,
                                                password: '',
                                            }));
                                        }}
                                    >
                                        Email an invite instead
                                    </Button>
                                </>
                            )}
                        </Form.Text>
                    </Form.Group>
                )}
                <Form.Check
                    type="switch"
                    id="isSuper"
                    label="Super user (can undo changes and manage users)"
                    checked={values.isSuper}
                    onChange={set('isSuper')}
                    disabled={isSelf}
                    className="mb-2"
                />
                {user && (
                    <Form.Check
                        type="switch"
                        id="active"
                        label="Active (can log in)"
                        checked={values.active}
                        onChange={set('active')}
                        disabled={isSelf}
                    />
                )}
                {error && (
                    <Alert variant="danger" className="mt-3 mb-0">
                        {error}
                    </Alert>
                )}
            </Modal.Body>
            <Modal.Footer>
                <Button variant="light" onClick={onHide} disabled={saving}>
                    Cancel
                </Button>
                <Button type="submit" disabled={saving}>
                    {saving
                        ? 'Saving…'
                        : user
                          ? 'Save changes'
                          : manualPassword
                            ? 'Add user'
                            : 'Add & send invite'}
                </Button>
            </Modal.Footer>
        </Form>
    );
}

UserForm.propTypes = {
    user: PropTypes.object,
    isSelf: PropTypes.bool,
    onHide: PropTypes.func.isRequired,
    onSaved: PropTypes.func.isRequired,
};

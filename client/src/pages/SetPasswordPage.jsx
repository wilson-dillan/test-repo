import { useEffect, useState } from 'react';
import { Link, useNavigate } from 'react-router-dom';
import Alert from 'react-bootstrap/Alert';
import Button from 'react-bootstrap/Button';
import Form from 'react-bootstrap/Form';
import { api } from '../api';
import { useAuth } from '../hooks';
import { AuthShell } from '../components/AuthShell';
import { PageLoader } from '../components/ui';

// Opened from an invite or reset email: /set-password?token=...
export function SetPasswordPage() {
    const { signedIn } = useAuth();
    const navigate = useNavigate();
    // Read the token once, then drop it from the address bar so it isn't
    // left in history or shared by accident.
    const [token] = useState(() =>
        new URLSearchParams(window.location.search).get('token'),
    );
    const [link, setLink] = useState(undefined);
    const [linkError, setLinkError] = useState(null);
    const [password, setPassword] = useState('');
    const [confirm, setConfirm] = useState('');
    const [submitting, setSubmitting] = useState(false);
    const [error, setError] = useState(null);

    useEffect(() => {
        window.history.replaceState(window.history.state, '', '/set-password');
        if (!token) {
            setLinkError(
                'This link is missing its code. Open it from the email again.',
            );
            return;
        }
        api.get(`/auth/password-link/${encodeURIComponent(token)}`)
            .then(setLink)
            .catch((err) => setLinkError(err.message));
    }, [token]);

    const submit = async (e) => {
        e.preventDefault();
        if (password !== confirm) {
            setError("The two passwords don't match.");
            return;
        }
        setSubmitting(true);
        setError(null);
        try {
            const user = await api.post(
                `/auth/password-link/${encodeURIComponent(token)}`,
                { password },
            );
            signedIn(user);
            navigate('/', { replace: true });
        } catch (err) {
            setError(err.message);
            setSubmitting(false);
        }
    };

    const invite = link?.purpose === 'invite';

    return (
        <AuthShell>
            {linkError && (
                <>
                    <h1 className="text-center mb-4 h2">Link not working</h1>
                    <Alert variant="warning">{linkError}</Alert>
                    <div className="d-grid gap-2">
                        <Link to="/forgot-password" className="btn btn-primary">
                            Email me a new link
                        </Link>
                        <Link to="/" className="btn btn-light">
                            Back to login
                        </Link>
                    </div>
                </>
            )}
            {!linkError && link === undefined && <PageLoader />}
            {link && (
                <Form onSubmit={submit}>
                    <h1 className="text-center mb-2 h2">
                        {invite
                            ? `Welcome, ${link.displayName.split(' ')[0]}!`
                            : 'Choose a new password'}
                    </h1>
                    <p className="text-muted text-center mb-4">
                        {invite
                            ? 'Create a password to finish setting up your account.'
                            : 'Pick a new password for your account.'}{' '}
                        Your username is <strong>{link.username}</strong>.
                    </p>
                    {error && <Alert variant="danger">{error}</Alert>}
                    <Form.Group className="mb-3" controlId="newPassword">
                        <Form.Label>New password</Form.Label>
                        <Form.Control
                            type="password"
                            value={password}
                            onChange={(e) => setPassword(e.target.value)}
                            autoComplete="new-password"
                            minLength={8}
                            autoFocus
                            required
                        />
                        <Form.Text>At least 8 characters.</Form.Text>
                    </Form.Group>
                    <Form.Group className="mb-4" controlId="confirmPassword">
                        <Form.Label>Type it again</Form.Label>
                        <Form.Control
                            type="password"
                            value={confirm}
                            onChange={(e) => setConfirm(e.target.value)}
                            autoComplete="new-password"
                            minLength={8}
                            required
                        />
                    </Form.Group>
                    <Button
                        type="submit"
                        size="lg"
                        className="w-100"
                        disabled={submitting}
                    >
                        {submitting
                            ? 'Saving…'
                            : invite
                              ? 'Create password & log in'
                              : 'Save password & log in'}
                    </Button>
                </Form>
            )}
        </AuthShell>
    );
}

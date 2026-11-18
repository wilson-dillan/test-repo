import { useState } from 'react';
import { Link } from 'react-router-dom';
import Alert from 'react-bootstrap/Alert';
import Button from 'react-bootstrap/Button';
import Form from 'react-bootstrap/Form';
import { FontAwesomeIcon } from '@fortawesome/react-fontawesome';
import { faArrowLeft, faEnvelope } from '@fortawesome/free-solid-svg-icons';
import { api } from '../api';
import { AuthShell } from '../components/AuthShell';

export function ForgotPasswordPage() {
    const [login, setLogin] = useState('');
    const [submitting, setSubmitting] = useState(false);
    const [sent, setSent] = useState(null);
    const [error, setError] = useState(null);

    const submit = async (e) => {
        e.preventDefault();
        setSubmitting(true);
        setError(null);
        try {
            setSent((await api.post('/auth/forgot', { login })).message);
        } catch (err) {
            setError(err.message);
        } finally {
            setSubmitting(false);
        }
    };

    return (
        <AuthShell>
            <h1 className="text-center mb-2 h2">Forgot password?</h1>
            {sent ? (
                <>
                    <div className="text-center my-4">
                        <span className="confirm-icon success">
                            <FontAwesomeIcon icon={faEnvelope} />
                        </span>
                    </div>
                    <Alert variant="success">{sent}</Alert>
                    <p className="text-muted small">
                        Check your inbox and spam folder. No email? Your account
                        may not have an email address. Your admin has been told
                        about the request and can help.
                    </p>
                </>
            ) : (
                <Form onSubmit={submit}>
                    <p className="text-muted text-center mb-4">
                        Enter your username or email and we&apos;ll email you a
                        link to choose a new password.
                    </p>
                    {error && <Alert variant="danger">{error}</Alert>}
                    <Form.Group className="mb-4" controlId="login">
                        <Form.Label>Username or email</Form.Label>
                        <Form.Control
                            value={login}
                            onChange={(e) => setLogin(e.target.value)}
                            autoComplete="username"
                            autoCapitalize="none"
                            autoFocus
                            required
                        />
                    </Form.Group>
                    <Button
                        type="submit"
                        size="lg"
                        className="w-100"
                        disabled={submitting}
                    >
                        {submitting ? 'Sending…' : 'Email me a reset link'}
                    </Button>
                </Form>
            )}
            <div className="text-center mt-4">
                <Link to="/" className="back-link mb-0">
                    <FontAwesomeIcon icon={faArrowLeft} />
                    Back to login
                </Link>
            </div>
        </AuthShell>
    );
}

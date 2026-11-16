import { useState } from 'react';
import Alert from 'react-bootstrap/Alert';
import Button from 'react-bootstrap/Button';
import Form from 'react-bootstrap/Form';
import logo from '../assets/wilson-logo.png';
import { useAuth } from '../hooks';

export function LoginPage() {
    const { login } = useAuth();
    const [username, setUsername] = useState('');
    const [password, setPassword] = useState('');
    const [submitting, setSubmitting] = useState(false);
    const [error, setError] = useState(null);

    const submit = async (e) => {
        e.preventDefault();
        setSubmitting(true);
        setError(null);
        try {
            await login(username, password);
        } catch (err) {
            setError(err.message);
            setSubmitting(false);
        }
    };

    return (
        <div className="login-page">
            <section className="login-brand">
                <div className="logo-card">
                    <img src={logo} alt="Wilson Services, Inc." />
                </div>
                <h2>Every project, task and document in one place.</h2>
                <p>
                    Track jobs from first visit to final paperwork, and see who
                    is working on what.
                </p>
                <div className="ring" aria-hidden />
            </section>

            <section className="login-form-side">
                <Form className="login-card panel p-4 p-sm-5" onSubmit={submit}>
                    <img
                        src={logo}
                        alt="Wilson Services, Inc."
                        className="mobile-logo"
                    />
                    <h1 className="text-center mb-4">LOGIN</h1>

                    {error && <Alert variant="danger">{error}</Alert>}

                    <Form.Group className="mb-3" controlId="username">
                        <Form.Label>Username</Form.Label>
                        <Form.Control
                            value={username}
                            onChange={(e) => setUsername(e.target.value)}
                            autoComplete="username"
                            autoCapitalize="none"
                            autoFocus
                            required
                        />
                    </Form.Group>
                    <Form.Group className="mb-4" controlId="password">
                        <Form.Label>Password</Form.Label>
                        <Form.Control
                            type="password"
                            value={password}
                            onChange={(e) => setPassword(e.target.value)}
                            autoComplete="current-password"
                            required
                        />
                    </Form.Group>
                    <Button
                        type="submit"
                        size="lg"
                        className="w-100"
                        disabled={submitting}
                    >
                        {submitting ? 'Logging in…' : 'Log In'}
                    </Button>
                    <p className="text-muted small text-center mt-4 mb-0">
                        Need an account? Ask your super user.
                    </p>
                </Form>
            </section>
        </div>
    );
}

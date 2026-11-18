import { useState } from 'react';
import { Link } from 'react-router-dom';
import Alert from 'react-bootstrap/Alert';
import Button from 'react-bootstrap/Button';
import Form from 'react-bootstrap/Form';
import { useAuth } from '../hooks';
import { AuthShell } from '../components/AuthShell';

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
        <AuthShell>
            <Form onSubmit={submit}>
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
                    <div className="d-flex justify-content-between align-items-baseline">
                        <Form.Label>Password</Form.Label>
                        <Link to="/forgot-password" className="small">
                            Forgot password?
                        </Link>
                    </div>
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
                    Need an account? Ask your admin.
                </p>
            </Form>
        </AuthShell>
    );
}

import PropTypes from 'prop-types';
import logo from '../assets/wilson-logo.png';

// The two-column layout shared by the login, forgot-password and
// set-password screens.
export function AuthShell({ children }) {
    return (
        <div className="login-page">
            <section className="login-brand">
                <div className="logo-card">
                    <img src={logo} alt="Wilson Services, Inc." />
                </div>
                <h2>Mass Save Application Tracker</h2>
                <div className="ring" aria-hidden />
            </section>

            <section className="login-form-side">
                <div className="login-card panel p-4 p-sm-5">
                    <img
                        src={logo}
                        alt="Wilson Services, Inc."
                        className="mobile-logo"
                    />
                    {children}
                </div>
            </section>
        </div>
    );
}

AuthShell.propTypes = { children: PropTypes.node };

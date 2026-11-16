import { useEffect, useState } from 'react';
import { NavLink, Outlet, useLocation } from 'react-router-dom';
import Button from 'react-bootstrap/Button';
import { FontAwesomeIcon } from '@fortawesome/react-fontawesome';
import {
    faBars,
    faChartColumn,
    faCirclePlus,
    faClockRotateLeft,
    faHouse,
    faRightFromBracket,
    faUsers,
} from '@fortawesome/free-solid-svg-icons';
import logo from '../assets/wilson-logo.png';
import { useAuth } from '../hooks';
import { ActivityDrawer } from './ActivityDrawer';
import { Avatar } from './ui';

export function Layout() {
    const { user, logout } = useAuth();
    const [menuOpen, setMenuOpen] = useState(false);
    const [activityOpen, setActivityOpen] = useState(false);
    const location = useLocation();

    useEffect(() => setMenuOpen(false), [location.pathname]);

    const link = (to, icon, label, extra = '') => (
        <NavLink
            to={to}
            end={to === '/'}
            className={({ isActive }) =>
                `sidebar-link ${extra} ${isActive ? 'active' : ''}`
            }
        >
            <FontAwesomeIcon icon={icon} />
            {label}
        </NavLink>
    );

    return (
        <div className="app-shell">
            <header className="topbar">
                <Button
                    variant="link"
                    onClick={() => setMenuOpen(true)}
                    aria-label="Open menu"
                >
                    <FontAwesomeIcon icon={faBars} size="lg" />
                </Button>
                <img src={logo} alt="Wilson Services" />
            </header>

            {menuOpen && (
                <div
                    className="sidebar-backdrop"
                    onClick={() => setMenuOpen(false)}
                />
            )}

            <aside className={`sidebar ${menuOpen ? 'open' : ''}`}>
                <NavLink to="/" className="sidebar-logo">
                    <img src={logo} alt="Wilson Services, Inc." />
                </NavLink>

                <nav className="sidebar-nav" aria-label="Main">
                    {link(
                        '/projects/new',
                        faCirclePlus,
                        'Track New Application',
                        'sidebar-cta',
                    )}
                    {link('/dashboard', faChartColumn, 'Dashboard')}
                    {link('/', faHouse, 'Home')}
                    <button
                        type="button"
                        className="sidebar-link"
                        onClick={() => setActivityOpen(true)}
                    >
                        <FontAwesomeIcon icon={faClockRotateLeft} />
                        Activity
                    </button>

                    {user.isSuper && (
                        <>
                            <div className="sidebar-section">Admin</div>
                            {link('/users', faUsers, 'Users')}
                        </>
                    )}
                </nav>

                <div className="sidebar-user">
                    <Avatar name={user.displayName} />
                    <div className="min-w-0">
                        <div className="name">{user.displayName}</div>
                        <div className="role">
                            {user.isSuper ? 'Super user' : 'Team member'}
                        </div>
                    </div>
                    <Button
                        variant="link"
                        className="btn-logout"
                        onClick={logout}
                        title="Log out"
                        aria-label="Log out"
                    >
                        <FontAwesomeIcon icon={faRightFromBracket} />
                    </Button>
                </div>
            </aside>

            <main className="main">
                <Outlet />
            </main>

            <ActivityDrawer
                show={activityOpen}
                onHide={() => setActivityOpen(false)}
            />
        </div>
    );
}

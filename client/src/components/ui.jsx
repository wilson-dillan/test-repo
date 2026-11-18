import PropTypes from 'prop-types';
import { Link, useNavigate } from 'react-router-dom';
import Alert from 'react-bootstrap/Alert';
import Spinner from 'react-bootstrap/Spinner';
import { FontAwesomeIcon } from '@fortawesome/react-fontawesome';
import { faArrowLeft, faCalendarDays } from '@fortawesome/free-solid-svg-icons';
import {
    PROJECT_STATUS_LABELS,
    STATE_LABELS,
    dueStatus,
    formatDate,
    initials,
} from '../format';

export function InactiveBadge({ label = 'Inactive' }) {
    return <span className="inactive-badge">{label}</span>;
}

InactiveBadge.propTypes = { label: PropTypes.string };

// The stage of an application: To Do / In Progress / Submitted / Done.
export function ProjectStatusPill({ status }) {
    return (
        <span className={`state-pill ${status}`}>
            <span className="dot" />
            {PROJECT_STATUS_LABELS[status]}
        </span>
    );
}

ProjectStatusPill.propTypes = {
    status: PropTypes.oneOf(['todo', 'in_progress', 'submitted', 'done']),
};

export function StatePill({ state }) {
    return (
        <span className={`state-pill ${state}`}>
            <span className="dot" />
            {STATE_LABELS[state]}
        </span>
    );
}

StatePill.propTypes = {
    state: PropTypes.oneOf(['todo', 'in_progress', 'done']),
};

export function Avatar({ name, size }) {
    return (
        <span className={`avatar ${size || ''}`} title={name} aria-hidden>
            {initials(name)}
        </span>
    );
}

Avatar.propTypes = { name: PropTypes.string, size: PropTypes.string };

export function Owner({ name }) {
    return (
        <span className="owner">
            <Avatar name={name} size="sm" />
            {name}
        </span>
    );
}

Owner.propTypes = { name: PropTypes.string };

export function DueDate({ date, state, prefix }) {
    const status = dueStatus(date, state);
    return (
        <span className={`due ${status || ''}`}>
            <FontAwesomeIcon icon={faCalendarDays} />
            {date && prefix}
            {formatDate(date)}
            {status === 'overdue' && ' · Overdue'}
        </span>
    );
}

DueDate.propTypes = {
    date: PropTypes.string,
    state: PropTypes.string,
    prefix: PropTypes.string,
};

export function PageLoader() {
    return (
        <div className="page-loader">
            <Spinner animation="border" variant="primary" role="status">
                <span className="visually-hidden">Loading…</span>
            </Spinner>
        </div>
    );
}

export function LoadError({ error, onRetry }) {
    return (
        <Alert variant="danger" className="d-flex align-items-center gap-3">
            <div className="me-auto">{error.message}</div>
            {onRetry && (
                <button
                    className="btn btn-sm btn-outline-danger"
                    onClick={onRetry}
                >
                    Try again
                </button>
            )}
        </Alert>
    );
}

LoadError.propTypes = { error: PropTypes.object, onRetry: PropTypes.func };

export function EmptyState({ icon, children, action }) {
    return (
        <div className="empty-state">
            {icon && <FontAwesomeIcon icon={icon} className="icon" />}
            <p>{children}</p>
            {action}
        </div>
    );
}

EmptyState.propTypes = {
    icon: PropTypes.object,
    children: PropTypes.node,
    action: PropTypes.node,
};

// Goes back in history when there is somewhere to go back to, otherwise
// to `to` (e.g. when the page was opened from an email link).
export function BackLink({ to, children }) {
    const navigate = useNavigate();
    return (
        <Link
            to={to}
            className="back-link"
            onClick={(e) => {
                if (window.history.state?.idx > 0) {
                    e.preventDefault();
                    navigate(-1);
                }
            }}
        >
            <FontAwesomeIcon icon={faArrowLeft} />
            {children}
        </Link>
    );
}

BackLink.propTypes = { to: PropTypes.string, children: PropTypes.node };

export function ReadField({ label, children, className }) {
    return (
        <div className={`read-field ${className || ''}`}>
            <div className="label">{label}</div>
            <div className="value">{children}</div>
        </div>
    );
}

ReadField.propTypes = {
    label: PropTypes.string,
    children: PropTypes.node,
    className: PropTypes.string,
};

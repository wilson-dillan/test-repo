import { useState } from 'react';
import PropTypes from 'prop-types';
import { Link } from 'react-router-dom';
import Button from 'react-bootstrap/Button';
import { FontAwesomeIcon } from '@fortawesome/react-fontawesome';
import {
    faCheck,
    faClockRotateLeft,
    faFolderOpen,
    faPaperclip,
    faPaperPlane,
    faSackDollar,
    faPenToSquare,
    faRotateLeft,
    faUser,
    faBoxArchive,
} from '@fortawesome/free-solid-svg-icons';
import { api } from '../api';
import { useAuth } from '../hooks';
import { describeHistory, formatDateTime, timeAgo } from '../format';
import { ConfirmModal } from './ConfirmModal';
import { EmptyState } from './ui';

function iconFor(entry) {
    if (entry.action === 'created') return [faFolderOpen, ''];
    if (entry.action === 'file') return [faPaperclip, ''];
    if (entry.action === 'undo') return [faRotateLeft, 'undo'];
    if (entry.action === 'rebate') return [faSackDollar, 'done'];
    if (entry.action === 'reopen') return [faRotateLeft, 'undo'];
    if (entry.field === 'state' && entry.newValue === 'submitted')
        return [faPaperPlane, ''];
    if (entry.field === 'state')
        return entry.newValue === 'done'
            ? [faCheck, 'done']
            : [faRotateLeft, 'undo'];
    if (entry.field === 'owner_id') return [faUser, ''];
    if (entry.field === 'active' && entry.taskId)
        return entry.newValue === 'false'
            ? [faBoxArchive, 'inactive']
            : [faCheck, ''];
    if (entry.field === 'active')
        return entry.newValue === 'false'
            ? [faBoxArchive, 'inactive']
            : [faRotateLeft, 'undo'];
    return [faPenToSquare, ''];
}

function targetLabel(entry) {
    return entry.taskCode
        ? `${entry.taskCode} · ${entry.taskName}`
        : `Project ${entry.projectId}`;
}

function HistoryItem({ entry, showTarget, linkTarget, onUndo }) {
    const { user } = useAuth();
    const [icon, tone] = iconFor(entry);
    const { verb, suffix, detail } = describeHistory(
        entry,
        Boolean(showTarget),
    );
    const href = entry.taskId
        ? `/tasks/${entry.taskId}`
        : `/projects/${entry.projectId}`;

    const target = showTarget && (
        <>
            {' '}
            <span className="target">{targetLabel(entry)}</span>
            {!entry.taskId && entry.customerName && (
                <span className="detail"> ({entry.customerName})</span>
            )}
        </>
    );

    const sentence = (
        <div>
            <span className="actor">{entry.actor || 'Someone'}</span> {verb}
            {target}
            {suffix && ` ${suffix}`}
            {detail && <span className="detail"> · {detail}</span>}
        </div>
    );

    return (
        <li className={`timeline-item ${entry.undone ? 'is-undone' : ''}`}>
            <span className={`history-icon ${tone}`}>
                <FontAwesomeIcon icon={icon} />
            </span>
            <div className="content">
                {linkTarget ? (
                    <Link to={href} className="activity-link">
                        {sentence}
                    </Link>
                ) : (
                    sentence
                )}
                <div className="when">
                    <span title={formatDateTime(entry.createdAt)}>
                        {timeAgo(entry.createdAt)}
                    </span>
                    {entry.undone && (
                        <span className="undone-tag">
                            Undone by {entry.undoneBy}
                        </span>
                    )}
                    {user.isSuper && entry.undoable && (
                        <Button
                            variant="outline-secondary"
                            size="sm"
                            className="btn-undo"
                            onClick={() => onUndo(entry)}
                        >
                            <FontAwesomeIcon
                                icon={faRotateLeft}
                                className="me-1"
                            />
                            Undo (admin only)
                        </Button>
                    )}
                </div>
            </div>
        </li>
    );
}

HistoryItem.propTypes = {
    entry: PropTypes.object.isRequired,
    showTarget: PropTypes.bool,
    linkTarget: PropTypes.bool,
    onUndo: PropTypes.func,
};

function UndoSummary({ entry }) {
    const { verb, suffix, detail } = describeHistory(entry);
    return (
        <>
            <strong>{entry.actor}</strong> {verb} {targetLabel(entry)}
            {suffix && ` ${suffix}`}
            {detail && ` (${detail})`}. The undo is recorded in the history.
        </>
    );
}

UndoSummary.propTypes = { entry: PropTypes.object.isRequired };

// A vertical timeline of changes. The super user gets an Undo button on
// each change that can still be reverted.
export function HistoryTimeline({ entries, showTarget, linkTarget, scroll }) {
    const { notifyChange } = useAuth();
    const [undoing, setUndoing] = useState(null);

    if (!entries.length)
        return (
            <EmptyState icon={faClockRotateLeft}>No changes yet.</EmptyState>
        );

    return (
        <>
            <ul className={`timeline ${scroll ? 'scroll' : ''}`}>
                {entries.map((entry) => (
                    <HistoryItem
                        key={entry.id}
                        entry={entry}
                        showTarget={showTarget}
                        linkTarget={linkTarget}
                        onUndo={setUndoing}
                    />
                ))}
            </ul>
            <ConfirmModal
                show={Boolean(undoing)}
                onHide={() => setUndoing(null)}
                onConfirm={async () => {
                    await api.post(`/activity/${undoing.id}/undo`);
                    notifyChange();
                }}
                icon={faRotateLeft}
                tone="success"
                title="Undo this change?"
                confirmLabel="Undo change"
            >
                {undoing && <UndoSummary entry={undoing} />}
            </ConfirmModal>
        </>
    );
}

HistoryTimeline.propTypes = {
    entries: PropTypes.array.isRequired,
    showTarget: PropTypes.bool,
    linkTarget: PropTypes.bool,
    scroll: PropTypes.bool,
};

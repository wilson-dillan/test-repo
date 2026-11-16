import PropTypes from 'prop-types';
import Offcanvas from 'react-bootstrap/Offcanvas';
import { api } from '../api';
import { useLoad } from '../hooks';
import { HistoryTimeline } from './HistoryTimeline';
import { LoadError, PageLoader } from './ui';

// Slide-out panel with the latest changes across every project and task.
function ActivityFeed() {
    const { data, error, reload } = useLoad(() =>
        api.get('/activity?limit=60'),
    );
    if (error) return <LoadError error={error} onRetry={reload} />;
    if (!data) return <PageLoader />;
    return <HistoryTimeline entries={data} showTarget linkTarget />;
}

export function ActivityDrawer({ show, onHide }) {
    return (
        <Offcanvas
            show={show}
            onHide={onHide}
            placement="end"
            className="activity-drawer"
        >
            <Offcanvas.Header closeButton>
                <Offcanvas.Title>Recent activity</Offcanvas.Title>
            </Offcanvas.Header>
            <Offcanvas.Body onClick={(e) => e.target.closest('a') && onHide()}>
                {show && <ActivityFeed />}
            </Offcanvas.Body>
        </Offcanvas>
    );
}

ActivityDrawer.propTypes = {
    show: PropTypes.bool,
    onHide: PropTypes.func.isRequired,
};

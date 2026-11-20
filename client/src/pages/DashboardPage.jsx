import PropTypes from 'prop-types';
import { useEffect, useMemo, useRef, useState } from 'react';
import { useNavigate } from 'react-router-dom';
import ButtonGroup from 'react-bootstrap/ButtonGroup';
import Button from 'react-bootstrap/Button';
import Col from 'react-bootstrap/Col';
import Form from 'react-bootstrap/Form';
import ProgressBar from 'react-bootstrap/ProgressBar';
import Row from 'react-bootstrap/Row';
import {
    faClockRotateLeft,
    faFolderOpen,
} from '@fortawesome/free-solid-svg-icons';
import { FontAwesomeIcon } from '@fortawesome/react-fontawesome';
import { api } from '../api';
import { useLoad } from '../hooks';
import { ActivityDrawer } from '../components/ActivityDrawer';
import { HistoryTimeline } from '../components/HistoryTimeline';
import {
    ApplicationStatusChart,
    PriorityChart,
    RebatesByWeekChart,
    UserWorkloadChart,
} from '../components/charts';
import { ProjectItem, TaskItem } from '../components/cards';
import {
    PROJECT_STATUS_LABELS,
    daysOld,
    formatAge,
    rankByPriority,
} from '../format';
import {
    EmptyState,
    InactiveBadge,
    LoadError,
    Owner,
    PageLoader,
    ProjectStatusPill,
} from '../components/ui';

export function DashboardPage() {
    const { data, error, reload } = useLoad(() =>
        Promise.all([
            api.get('/stats'),
            api.get('/projects'),
            api.get('/tasks'),
        ]),
    );

    return (
        <>
            <div className="page-header">
                <div>
                    <div className="eyebrow">Team overview</div>
                    <h1>Dashboard</h1>
                </div>
            </div>
            {error && <LoadError error={error} onRetry={reload} />}
            {!data && !error && <PageLoader />}
            {data && (
                <DashboardContent
                    stats={data[0]}
                    projects={data[1]}
                    tasks={data[2]}
                />
            )}
        </>
    );
}

const STATUS_ORDER = ['todo', 'in_progress', 'submitted', 'done'];
const PRIORITY_SHOWN = 8;

function DashboardContent({ stats, projects, tasks }) {
    const [filter, setFilter] = useState('open');
    const [selectedUser, setSelectedUser] = useState(null);
    const active = projects.filter((p) => p.active);
    const counts = STATUS_ORDER.map((status) => ({
        status,
        label: status === 'done' ? 'Done' : PROJECT_STATUS_LABELS[status],
        count: active.filter((p) => p.status === status).length,
    }));
    const open = active.filter((p) => p.status !== 'done');

    // Open tasks: not done, still needed, on an active application.
    const openTasks = tasks.filter(
        (t) => t.state === 'todo' && t.active && t.projectActive !== false,
    );
    const workload = stats.tasksPerUser.map((u) => ({
        id: u.id,
        name: u.name,
        applications: open.filter((p) => p.owner.id === u.id).length,
        openTasks: openTasks.filter((t) => t.owner.id === u.id).length,
    }));
    const selected = workload.find((u) => u.id === selectedUser);

    return (
        <>
            <Row className="g-4 mb-4">
                <Col lg={7}>
                    <HighestPriority projects={projects} />
                </Col>
                <Col lg={5}>
                    <section className="panel h-100">
                        <div className="panel-title">
                            <h2>Application Status</h2>
                            <span className="text-muted small">
                                Active applications
                            </span>
                        </div>
                        <ApplicationStatusChart
                            counts={counts}
                            onSelect={(status) => {
                                setFilter(status);
                                document
                                    .querySelector('.all-applications')
                                    ?.scrollIntoView({ behavior: 'smooth' });
                            }}
                        />
                    </section>
                </Col>
            </Row>

            <Row className="g-4 mb-4">
                <Col lg={7}>
                    <section className="panel h-100">
                        <div className="panel-title">
                            <h2>Rebates Received by Week</h2>
                            <span className="text-muted small">
                                Last 12 weeks
                            </span>
                        </div>
                        <RebatesByWeekChart weeks={stats.rebatesByWeek} />
                    </section>
                </Col>
                <Col lg={5}>
                    <RecentActivity />
                </Col>
            </Row>

            <AllProjects
                projects={projects}
                state={filter}
                onStateChange={setFilter}
            />
            <section className="panel mb-4">
                <div className="panel-title">
                    <h2>Applications &amp; Tasks by User</h2>
                    <span className="text-muted small">
                        Click a person to see their work
                    </span>
                </div>
                <UserWorkloadChart
                    users={workload}
                    selectedId={selectedUser}
                    onSelect={(id) =>
                        setSelectedUser((current) =>
                            current === id ? null : id,
                        )
                    }
                />
                {selected && (
                    <UserWork
                        // Remount per person so the highlight replays.
                        key={selected.id}
                        user={selected}
                        projects={open.filter(
                            (p) => p.owner.id === selected.id,
                        )}
                        tasks={openTasks.filter(
                            (t) => t.owner.id === selected.id,
                        )}
                        onClose={() => setSelectedUser(null)}
                    />
                )}
            </section>
        </>
    );
}

DashboardContent.propTypes = {
    stats: PropTypes.object.isRequired,
    projects: PropTypes.array.isRequired,
    tasks: PropTypes.array.isRequired,
};

function HighestPriority({ projects }) {
    const navigate = useNavigate();
    const ranked = rankByPriority(projects);

    return (
        <section className="panel h-100">
            <div className="panel-title">
                <h2>Highest Priority</h2>
            </div>
            <div className="small text-muted mb-2">
                The oldest and most incomplete applications are the highest
                priority.
            </div>
            {ranked.length ? (
                <PriorityChart
                    ranked={ranked.slice(0, PRIORITY_SHOWN)}
                    onOpen={(p) => navigate(`/projects/${p.id}`)}
                    formatAge={formatAge}
                />
            ) : (
                <EmptyState icon={faFolderOpen}>
                    Every open application has all its documents.
                </EmptyState>
            )}
            {ranked.length > PRIORITY_SHOWN && (
                <div className="small text-muted mt-2">
                    Showing the top {PRIORITY_SHOWN} of {ranked.length} still
                    collecting documents.
                </div>
            )}
        </section>
    );
}

HighestPriority.propTypes = { projects: PropTypes.array.isRequired };

// The open applications and open tasks of the person clicked in the chart,
// shown right under it with a highlight so it's easy to spot.
function UserWork({ user, projects, tasks, onClose }) {
    const ref = useRef(null);
    useEffect(() => {
        ref.current?.scrollIntoView({ behavior: 'smooth', block: 'nearest' });
    }, []);
    return (
        <div className="user-work" ref={ref}>
            <div className="user-work-head">
                <h3>{user.name}</h3>
                <Button
                    variant="link"
                    size="sm"
                    className="p-0"
                    onClick={onClose}
                >
                    Close
                </Button>
            </div>
            <Row className="g-4">
                <Col lg={6}>
                    <h4>
                        Open applications
                        <span className="count">{projects.length}</span>
                    </h4>
                    {projects.length ? (
                        <div className="user-task-list">
                            {projects.map((p) => (
                                <ProjectItem key={p.id} project={p} />
                            ))}
                        </div>
                    ) : (
                        <p className="text-muted small mb-0">
                            No open applications.
                        </p>
                    )}
                </Col>
                <Col lg={6}>
                    <h4>
                        Open tasks<span className="count">{tasks.length}</span>
                    </h4>
                    {tasks.length ? (
                        <div className="user-task-list">
                            {tasks.map((t) => (
                                <TaskItem key={t.id} task={t} />
                            ))}
                        </div>
                    ) : (
                        <p className="text-muted small mb-0">No open tasks.</p>
                    )}
                </Col>
            </Row>
        </div>
    );
}

UserWork.propTypes = {
    user: PropTypes.object.isRequired,
    projects: PropTypes.array.isRequired,
    tasks: PropTypes.array.isRequired,
    onClose: PropTypes.func.isRequired,
};

function AllProjects({ projects, state, onStateChange: setState }) {
    const navigate = useNavigate();
    const [search, setSearch] = useState('');

    const shown = useMemo(() => {
        const q = search.trim().toLowerCase();
        return projects.filter(
            (p) =>
                (state === 'all' ||
                    p.status === state ||
                    (state === 'open' && p.status !== 'done')) &&
                (!q ||
                    String(p.id) === q.replace('#', '') ||
                    p.customerName.toLowerCase().includes(q) ||
                    p.address.toLowerCase().includes(q) ||
                    p.owner.name.toLowerCase().includes(q)),
        );
    }, [projects, search, state]);

    return (
        <section className="panel all-applications mb-4">
            <div className="panel-title flex-wrap">
                <h2>
                    All Applications
                    <span className="count">{shown.length}</span>
                </h2>
                <div className="d-flex gap-2 flex-wrap">
                    <Form.Control
                        size="sm"
                        type="search"
                        placeholder="Search customer, address, owner, #ID"
                        value={search}
                        onChange={(e) => setSearch(e.target.value)}
                        style={{ minWidth: '15rem' }}
                        aria-label="Search projects"
                    />
                    <ButtonGroup size="sm">
                        {[
                            ['open', 'Open'],
                            ['todo', 'To Do'],
                            ['in_progress', 'In Progress'],
                            ['submitted', 'Submitted'],
                            ['done', 'Done'],
                            ['all', 'All'],
                        ].map(([value, label]) => (
                            <Button
                                key={value}
                                variant={
                                    state === value
                                        ? 'primary'
                                        : 'outline-primary'
                                }
                                onClick={() => setState(value)}
                            >
                                {label}
                            </Button>
                        ))}
                    </ButtonGroup>
                </div>
            </div>

            {shown.length ? (
                <div className="table-responsive">
                    <table className="table projects-table">
                        <thead>
                            <tr>
                                <th>ID</th>
                                <th>Customer</th>
                                <th>Type</th>
                                <th>Owner</th>
                                <th>Age</th>
                                <th>Tasks</th>
                                <th>State</th>
                            </tr>
                        </thead>
                        <tbody>
                            {shown.map((p) => (
                                <tr
                                    key={p.id}
                                    className={p.active ? '' : 'inactive-row'}
                                    onClick={() =>
                                        navigate(`/projects/${p.id}`)
                                    }
                                >
                                    <td>
                                        <span className="id-badge">
                                            #{p.id}
                                        </span>
                                    </td>
                                    <td>
                                        <div className="fw-semibold">
                                            {p.customerName}
                                        </div>
                                        <div className="small text-muted">
                                            {p.address}
                                        </div>
                                    </td>
                                    <td className="text-nowrap">
                                        {p.typeLabel}
                                    </td>
                                    <td className="text-nowrap">
                                        <Owner name={p.owner.name} />
                                    </td>
                                    <td
                                        className="text-nowrap"
                                        title={`Created ${new Date(p.createdAt).toLocaleDateString()}`}
                                    >
                                        {formatAge(daysOld(p.createdAt))}
                                    </td>
                                    <td>
                                        <ProgressBar
                                            now={
                                                p.taskTotal
                                                    ? (p.taskDone /
                                                          p.taskTotal) *
                                                      100
                                                    : 0
                                            }
                                        />
                                        <div className="small text-muted mt-1">
                                            {p.taskDone}/{p.taskTotal}
                                        </div>
                                    </td>
                                    <td>
                                        <span className="d-flex flex-column align-items-start gap-1">
                                            <ProjectStatusPill
                                                status={p.status}
                                            />
                                            {!p.active && <InactiveBadge />}
                                        </span>
                                    </td>
                                </tr>
                            ))}
                        </tbody>
                    </table>
                </div>
            ) : (
                <EmptyState icon={faFolderOpen}>
                    No applications match.
                </EmptyState>
            )}
        </section>
    );
}

AllProjects.propTypes = {
    projects: PropTypes.array.isRequired,
    state: PropTypes.string.isRequired,
    onStateChange: PropTypes.func.isRequired,
};

// The latest changes across every project, with the full list a click away.
function RecentActivity() {
    const [showAll, setShowAll] = useState(false);
    const { data, error, reload } = useLoad(() =>
        api.get('/activity?limit=12'),
    );
    return (
        <section className="panel h-100 recent-activity">
            <div className="panel-title">
                <h2>
                    <FontAwesomeIcon
                        icon={faClockRotateLeft}
                        className="me-2 text-primary"
                    />
                    Recent activity
                </h2>
                <Button
                    variant="link"
                    size="sm"
                    className="p-0"
                    onClick={() => setShowAll(true)}
                >
                    See all
                </Button>
            </div>
            {error && <LoadError error={error} onRetry={reload} />}
            {!data && !error && <PageLoader />}
            {data && (
                <HistoryTimeline entries={data} showTarget linkTarget scroll />
            )}
            <ActivityDrawer show={showAll} onHide={() => setShowAll(false)} />
        </section>
    );
}

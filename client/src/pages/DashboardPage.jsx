import PropTypes from 'prop-types';
import { useMemo, useState } from 'react';
import { useNavigate } from 'react-router-dom';
import ButtonGroup from 'react-bootstrap/ButtonGroup';
import Button from 'react-bootstrap/Button';
import Col from 'react-bootstrap/Col';
import Form from 'react-bootstrap/Form';
import ProgressBar from 'react-bootstrap/ProgressBar';
import Row from 'react-bootstrap/Row';
import { faFolderOpen } from '@fortawesome/free-solid-svg-icons';
import { api } from '../api';
import { useLoad } from '../hooks';
import {
    DonutChart,
    TasksPerUserChart,
    WeeklyCompletionsChart,
} from '../components/charts';
import {
    DueDate,
    EmptyState,
    InactiveBadge,
    LoadError,
    Owner,
    PageLoader,
    StatePill,
} from '../components/ui';

export function DashboardPage() {
    const { data, error, reload } = useLoad(() =>
        Promise.all([api.get('/stats'), api.get('/projects')]),
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
            {data && <DashboardContent stats={data[0]} projects={data[1]} />}
        </>
    );
}

function DashboardContent({ stats, projects }) {
    const weekTotal = stats.projectsCompletedByWeek.reduce(
        (sum, w) => sum + w.completed,
        0,
    );
    const tiles = [
        {
            label: 'Open projects',
            value: stats.projects.open,
            sub: `${stats.projects.inactive} inactive · ${stats.projects.total} total`,
        },
        {
            label: 'Projects done',
            value: stats.projects.done,
            sub: `${weekTotal} in the last 12 weeks`,
        },
        {
            label: 'Open tasks',
            value: stats.tasks.total - stats.tasks.done,
            sub: `${stats.tasks.done} of ${stats.tasks.total} done`,
        },
        {
            label: 'Team members',
            value: stats.tasksPerUser.length,
            sub: 'active users',
        },
    ];

    return (
        <>
            <Row className="g-3 mb-4">
                {tiles.map((tile) => (
                    <Col key={tile.label} xs={6} lg={3}>
                        <div className="panel stat-tile">
                            <div className="label">{tile.label}</div>
                            <div className="value">{tile.value}</div>
                            <div className="sub">{tile.sub}</div>
                        </div>
                    </Col>
                ))}
            </Row>

            <Row className="g-4 mb-4">
                <Col lg={7}>
                    <section className="panel h-100">
                        <div className="panel-title">
                            <h2>Tasks per User</h2>
                        </div>
                        <TasksPerUserChart users={stats.tasksPerUser} />
                    </section>
                </Col>
                <Col lg={5}>
                    <section className="panel h-100">
                        <div className="panel-title">
                            <h2>Completed Tasks: {stats.tasks.done}</h2>
                        </div>
                        <DonutChart
                            done={stats.tasks.done}
                            todo={stats.tasks.total - stats.tasks.done}
                            height={250}
                            label="tasks done"
                        />
                    </section>
                </Col>
            </Row>

            <section className="panel mb-4">
                <div className="panel-title">
                    <h2>Projects Completed by Week</h2>
                    <span className="text-muted small">Last 12 weeks</span>
                </div>
                <WeeklyCompletionsChart weeks={stats.projectsCompletedByWeek} />
            </section>

            <AllProjects projects={projects} />
        </>
    );
}

DashboardContent.propTypes = {
    stats: PropTypes.object.isRequired,
    projects: PropTypes.array.isRequired,
};

function AllProjects({ projects }) {
    const navigate = useNavigate();
    const [search, setSearch] = useState('');
    const [state, setState] = useState('todo');

    const shown = useMemo(() => {
        const q = search.trim().toLowerCase();
        return projects.filter(
            (p) =>
                (state === 'all' || p.state === state) &&
                (!q ||
                    String(p.id) === q.replace('#', '') ||
                    p.customerName.toLowerCase().includes(q) ||
                    p.address.toLowerCase().includes(q) ||
                    p.owner.name.toLowerCase().includes(q)),
        );
    }, [projects, search, state]);

    return (
        <section className="panel">
            <div className="panel-title flex-wrap">
                <h2>
                    All Projects<span className="count">{shown.length}</span>
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
                            ['todo', 'To Do'],
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
                                <th>Due</th>
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
                                    <td className="text-nowrap">
                                        <DueDate
                                            date={p.dueDate}
                                            state={p.state}
                                        />
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
                                            <StatePill state={p.state} />
                                            {!p.active && <InactiveBadge />}
                                        </span>
                                    </td>
                                </tr>
                            ))}
                        </tbody>
                    </table>
                </div>
            ) : (
                <EmptyState icon={faFolderOpen}>No projects match.</EmptyState>
            )}
        </section>
    );
}

AllProjects.propTypes = { projects: PropTypes.array.isRequired };

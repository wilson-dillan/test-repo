import PropTypes from 'prop-types';
import { Link } from 'react-router-dom';
import Col from 'react-bootstrap/Col';
import Row from 'react-bootstrap/Row';
import {
    faCirclePlus,
    faFolderOpen,
    faListCheck,
} from '@fortawesome/free-solid-svg-icons';
import { FontAwesomeIcon } from '@fortawesome/react-fontawesome';
import { api } from '../api';
import { useAuth, useLoad } from '../hooks';
import { ProjectCard, TaskItem } from '../components/cards';
import { DailyLineChart, DonutChart } from '../components/charts';
import { EmptyState, LoadError, PageLoader } from '../components/ui';

const today = new Intl.DateTimeFormat(undefined, {
    weekday: 'long',
    month: 'long',
    day: 'numeric',
});

export function HomePage() {
    const { user } = useAuth();
    const { data, error, reload } = useLoad(() =>
        Promise.all([
            api.get('/projects?owner=me'),
            api.get('/tasks?owner=me'),
            api.get('/stats/me'),
        ]),
    );

    const firstName = user.displayName.split(' ')[0];

    return (
        <>
            <div className="welcome">
                <h1>
                    Welcome, <span>{firstName}</span>
                </h1>
                <div className="text-muted">{today.format(new Date())}</div>
            </div>

            {error && <LoadError error={error} onRetry={reload} />}
            {!data && !error && <PageLoader />}
            {data && (
                <HomeContent
                    projects={data[0]}
                    tasks={data[1]}
                    activity={data[2].days}
                />
            )}
        </>
    );
}

function HomeContent({ projects, tasks, activity }) {
    const done = tasks.filter((t) => t.state === 'done').length;
    const openProjects = projects.filter(
        (p) => p.state === 'todo' && p.active,
    ).length;

    return (
        <Row className="g-4">
            <Col xl={8}>
                <section className="panel">
                    <div className="panel-title">
                        <h2>
                            My Projects
                            <span className="count">{openProjects} open</span>
                        </h2>
                        <Link
                            to="/projects/new"
                            className="btn btn-sm btn-outline-primary"
                        >
                            <FontAwesomeIcon
                                icon={faCirclePlus}
                                className="me-1"
                            />
                            Track new application
                        </Link>
                    </div>
                    {projects.length ? (
                        <div className="project-strip">
                            {projects.map((project) => (
                                <ProjectCard
                                    key={project.id}
                                    project={project}
                                />
                            ))}
                        </div>
                    ) : (
                        <EmptyState icon={faFolderOpen}>
                            You don&apos;t own any projects yet.
                        </EmptyState>
                    )}
                </section>

                <section className="panel">
                    <div className="panel-title">
                        <h2>My Task Progress</h2>
                    </div>
                    <Row className="align-items-center g-4">
                        <Col md={6}>
                            <DonutChart
                                done={done}
                                todo={tasks.length - done}
                                label="tasks done"
                            />
                        </Col>
                        <Col md={6}>
                            <ProgressFacts tasks={tasks} />
                        </Col>
                    </Row>
                </section>

                <Row className="g-4 mt-0">
                    <Col xs={12}>
                        <section className="panel h-100">
                            <div className="panel-title mb-1">
                                <h2>Tasks I Completed</h2>
                            </div>
                            <div className="text-muted small mb-2">
                                Per day · last 30 days
                            </div>
                            <DailyLineChart
                                days={activity}
                                field="tasksCompleted"
                                name="Tasks completed"
                            />
                        </section>
                    </Col>
                    <Col xs={12}>
                        <section className="panel h-100">
                            <div className="panel-title mb-1">
                                <h2>Applications I Submitted</h2>
                            </div>
                            <div className="text-muted small mb-2">
                                Per day · last 30 days
                            </div>
                            <DailyLineChart
                                days={activity}
                                field="applicationsSubmitted"
                                name="Applications submitted"
                            />
                        </section>
                    </Col>
                </Row>
            </Col>

            <Col xl={4}>
                <section className="panel h-100">
                    <div className="panel-title">
                        <h2>
                            My Tasks
                            <span className="count">
                                {tasks.length - done} to do
                            </span>
                        </h2>
                    </div>
                    {tasks.length ? (
                        <div className="task-list">
                            {tasks.map((task) => (
                                <TaskItem key={task.id} task={task} />
                            ))}
                        </div>
                    ) : (
                        <EmptyState icon={faListCheck}>
                            No tasks are assigned to you.
                        </EmptyState>
                    )}
                </section>
            </Col>
        </Row>
    );
}

HomeContent.propTypes = {
    projects: PropTypes.array.isRequired,
    tasks: PropTypes.array.isRequired,
    activity: PropTypes.array.isRequired,
};

function ProgressFacts({ tasks }) {
    const open = tasks.filter((t) => t.state === 'todo');
    const facts = [
        { label: 'Open tasks', value: open.length },
        { label: 'Done tasks', value: tasks.length - open.length },
    ];
    return (
        <dl className="mb-0">
            {facts.map((fact) => (
                <div
                    key={fact.label}
                    className="d-flex justify-content-between align-items-baseline py-2 border-bottom"
                >
                    <dt className="fw-normal text-muted">{fact.label}</dt>
                    <dd className={`mb-0 h4 ${fact.tone || ''}`}>
                        {fact.value}
                    </dd>
                </div>
            ))}
        </dl>
    );
}

ProgressFacts.propTypes = { tasks: PropTypes.array.isRequired };

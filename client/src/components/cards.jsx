import PropTypes from 'prop-types';
import { Link } from 'react-router-dom';
import ProgressBar from 'react-bootstrap/ProgressBar';
import {
    DueDate,
    InactiveBadge,
    Owner,
    ProjectStatusPill,
    StatePill,
} from './ui';

export function ProjectCard({ project }) {
    const percent = project.taskTotal
        ? (project.taskDone / project.taskTotal) * 100
        : 0;
    return (
        <Link
            to={`/projects/${project.id}`}
            className={`project-card ${project.state === 'done' ? 'is-done' : ''} ${project.active ? '' : 'is-inactive'}`}
        >
            <div className="d-flex align-items-center justify-content-between">
                <span className="id-badge">#{project.id}</span>
                <span className="d-flex gap-1">
                    {!project.active && <InactiveBadge />}
                    <ProjectStatusPill status={project.status} />
                </span>
            </div>
            <div>
                <div className="customer">{project.customerName}</div>
                <div className="address" title={project.address}>
                    {project.address}
                </div>
            </div>
            <div className="type-badge">{project.typeLabel}</div>
            <DueDate date={project.dueDate} state={project.state} />
            <div className="mt-auto">
                <ProgressBar now={percent} aria-label="Tasks done" />
                <div className="progress-label mt-1">
                    {project.taskDone} of {project.taskTotal} tasks done
                </div>
            </div>
        </Link>
    );
}

ProjectCard.propTypes = { project: PropTypes.object.isRequired };

export function TaskItem({ task, showOwner }) {
    return (
        <Link
            to={`/tasks/${task.id}`}
            className={`task-item ${task.state === 'done' ? 'is-done' : ''} ${task.projectActive === false ? 'is-inactive' : ''}`}
        >
            <span className="id-badge light">{task.code}</span>
            <div className="body">
                <div className="name">{task.name}</div>
                <div className="meta">{task.customerName}</div>
                {showOwner && (
                    <div className="mt-1">
                        <Owner name={task.owner.name} />
                    </div>
                )}
            </div>
            <span className="d-flex flex-column align-items-end gap-1">
                <StatePill state={task.state} />
                {task.projectActive === false && (
                    <InactiveBadge label="Inactive project" />
                )}
            </span>
        </Link>
    );
}

TaskItem.propTypes = {
    task: PropTypes.object.isRequired,
    showOwner: PropTypes.bool,
};

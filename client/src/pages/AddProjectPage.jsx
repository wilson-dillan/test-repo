import { useState } from 'react';
import PropTypes from 'prop-types';
import { useNavigate } from 'react-router-dom';
import Alert from 'react-bootstrap/Alert';
import Button from 'react-bootstrap/Button';
import Form from 'react-bootstrap/Form';
import { FontAwesomeIcon } from '@fortawesome/react-fontawesome';
import {
    faArrowLeft,
    faArrowRight,
    faCheck,
    faHouseChimney,
    faHouseChimneyWindow,
} from '@fortawesome/free-solid-svg-icons';
import { api } from '../api';
import { useAuth, useLoad } from '../hooks';
import { formatDate } from '../format';
import { LoadError, PageLoader } from '../components/ui';

const TYPE_ICONS = {
    whole_home: faHouseChimney,
    partial_home: faHouseChimneyWindow,
};

// One prompt per screen. `required` steps can't be skipped.
const STEPS = [
    {
        key: 'type',
        question: 'What kind of project is this?',
        helper: 'This decides which tasks and forms are created.',
        required: true,
    },
    {
        key: 'customerName',
        question: "What's the customer's name?",
        helper: 'Shown on the project card and every task.',
        required: true,
        maxLength: 200,
    },
    {
        key: 'address',
        question: 'Where is the job?',
        helper: 'The address of the home.',
        required: true,
        maxLength: 300,
    },
    {
        key: 'dueDate',
        question: 'When is it due?',
        helper: 'Optional. Leave blank if there is no due date yet.',
    },
    {
        key: 'ownerId',
        question: 'Who owns this project?',
        helper: 'Its tasks are assigned to them too, and they get an email.',
        required: true,
    },
    {
        key: 'note',
        question: 'Anything to note?',
        helper: 'Optional. Gate codes, customer preferences, anything useful.',
        maxLength: 2000,
    },
];

export function AddProjectPage() {
    const { data, error, reload } = useLoad(() =>
        Promise.all([api.get('/projects/types'), api.get('/users')]),
    );
    if (error) return <LoadError error={error} onRetry={reload} />;
    if (!data) return <PageLoader />;
    return <Wizard types={data[0]} users={data[1]} />;
}

function Wizard({ types, users }) {
    const { user, notifyChange } = useAuth();
    const navigate = useNavigate();
    const [step, setStep] = useState(0);
    const [values, setValues] = useState({
        type: '',
        customerName: '',
        address: '',
        dueDate: '',
        ownerId: String(user.id),
        note: '',
    });
    const [error, setError] = useState(null);
    const [submitting, setSubmitting] = useState(false);

    const reviewing = step === STEPS.length;
    const current = STEPS[step];
    const type = types.find((t) => t.id === values.type);
    const owner = users.find((u) => String(u.id) === values.ownerId);

    const set = (key, value) => {
        setValues((v) => ({ ...v, [key]: value }));
        setError(null);
    };

    const next = () => {
        if (current.required && !String(values[current.key]).trim()) {
            setError('Please answer this one to continue.');
            return;
        }
        setError(null);
        setStep((s) => s + 1);
    };

    const back = () => {
        setError(null);
        setStep((s) => s - 1);
    };

    const create = async () => {
        setSubmitting(true);
        setError(null);
        try {
            const project = await api.post('/projects', {
                ...values,
                ownerId: Number(values.ownerId),
                dueDate: values.dueDate || null,
            });
            notifyChange();
            navigate(`/projects/${project.id}`);
        } catch (err) {
            setError(err.message);
            setSubmitting(false);
        }
    };

    const onKeyDown = (e) => {
        if (e.key === 'Enter' && e.target.tagName !== 'TEXTAREA') {
            e.preventDefault();
            next();
        }
    };

    return (
        <div className="wizard">
            <div className="page-header">
                <div>
                    <div className="eyebrow">Track New Application</div>
                    <h1>New application</h1>
                </div>
            </div>

            <div className="wizard-steps" aria-hidden>
                {[...STEPS, { key: 'review' }].map((s, i) => (
                    <span
                        key={s.key}
                        className={
                            i < step ? 'done' : i === step ? 'current' : ''
                        }
                    />
                ))}
            </div>
            <div className="wizard-count">
                {reviewing ? 'Review' : `Step ${step + 1} of ${STEPS.length}`}
            </div>

            <div className="panel wizard-card">
                {reviewing ? (
                    <Review
                        values={values}
                        type={type}
                        owner={owner}
                        onEdit={(key) =>
                            setStep(STEPS.findIndex((s) => s.key === key))
                        }
                    />
                ) : (
                    <div onKeyDown={onKeyDown}>
                        <h2 className="question">{current.question}</h2>
                        <p className="helper">{current.helper}</p>
                        <StepInput
                            step={current}
                            value={values[current.key]}
                            onChange={(value) => set(current.key, value)}
                            onPick={(value) => {
                                set(current.key, value);
                                setStep((s) => s + 1);
                            }}
                            types={types}
                            users={users}
                        />
                    </div>
                )}

                {error && (
                    <Alert variant="danger" className="mt-3 mb-0">
                        {error}
                    </Alert>
                )}

                <div className="wizard-nav">
                    {step > 0 ? (
                        <Button
                            variant="light"
                            onClick={back}
                            disabled={submitting}
                        >
                            <FontAwesomeIcon
                                icon={faArrowLeft}
                                className="me-2"
                            />
                            Back
                        </Button>
                    ) : (
                        <span />
                    )}
                    {reviewing ? (
                        <Button
                            variant="success"
                            size="lg"
                            onClick={create}
                            disabled={submitting}
                        >
                            <FontAwesomeIcon icon={faCheck} className="me-2" />
                            {submitting ? 'Creating…' : 'Create project'}
                        </Button>
                    ) : (
                        <Button onClick={next}>
                            {!current.required && !values[current.key]
                                ? 'Skip'
                                : 'Next'}
                            <FontAwesomeIcon
                                icon={faArrowRight}
                                className="ms-2"
                            />
                        </Button>
                    )}
                </div>
            </div>
        </div>
    );
}

Wizard.propTypes = {
    types: PropTypes.array.isRequired,
    users: PropTypes.array.isRequired,
};

function StepInput({ step, value, onChange, onPick, types, users }) {
    const common = {
        value,
        onChange: (e) => onChange(e.target.value),
        autoFocus: true,
        maxLength: step.maxLength,
    };

    switch (step.key) {
        case 'type':
            return (
                <div className="type-choice">
                    {types.map((type) => (
                        <button
                            key={type.id}
                            type="button"
                            className={value === type.id ? 'selected' : ''}
                            onClick={() => onPick(type.id)}
                        >
                            <FontAwesomeIcon
                                icon={TYPE_ICONS[type.id] || faHouseChimney}
                                className="icon"
                            />
                            <span className="title">{type.label}</span>
                            <span className="desc">{type.description}</span>
                            <span className="tasks">
                                {type.tasks.length} forms to upload
                            </span>
                        </button>
                    ))}
                </div>
            );
        case 'dueDate':
            return (
                <Form.Control type="date" {...common} aria-label="Due date" />
            );
        case 'ownerId':
            return (
                <Form.Select {...common} aria-label="Owner">
                    {users.map((u) => (
                        <option key={u.id} value={u.id}>
                            {u.displayName}
                        </option>
                    ))}
                </Form.Select>
            );
        case 'note':
            return (
                <Form.Control
                    as="textarea"
                    rows={4}
                    {...common}
                    aria-label="Notes"
                />
            );
        default:
            return <Form.Control {...common} aria-label={step.question} />;
    }
}

StepInput.propTypes = {
    step: PropTypes.object.isRequired,
    value: PropTypes.string,
    onChange: PropTypes.func.isRequired,
    onPick: PropTypes.func.isRequired,
    types: PropTypes.array.isRequired,
    users: PropTypes.array.isRequired,
};

function Review({ values, type, owner, onEdit }) {
    const rows = [
        ['type', 'Type', type?.label],
        ['customerName', 'Customer', values.customerName],
        ['address', 'Address', values.address],
        [
            'dueDate',
            'Due date',
            values.dueDate ? formatDate(values.dueDate) : '—',
        ],
        ['ownerId', 'Owner', owner?.displayName],
        ['note', 'Notes', values.note || '—'],
    ];
    return (
        <>
            <h2 className="question">Look good?</h2>
            <p className="helper">
                Check the details. You can still change most of them later.
            </p>
            <dl className="review-list">
                {rows.map(([key, label, value]) => (
                    <div
                        key={key}
                        className="contents"
                        style={{ display: 'contents' }}
                    >
                        <dt>{label}</dt>
                        <dd>{value}</dd>
                        <Button variant="link" onClick={() => onEdit(key)}>
                            Edit
                        </Button>
                    </div>
                ))}
            </dl>
            {type && (
                <div className="mt-4">
                    <div className="form-label">Forms to upload</div>
                    <div className="task-preview">
                        {type.tasks.map((task, i) => (
                            <span key={task.name + i}>
                                <strong>{String.fromCharCode(97 + i)}</strong>
                                {task.name}
                            </span>
                        ))}
                    </div>
                </div>
            )}
        </>
    );
}

Review.propTypes = {
    values: PropTypes.object.isRequired,
    type: PropTypes.object,
    owner: PropTypes.object,
    onEdit: PropTypes.func.isRequired,
};

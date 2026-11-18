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
    faBolt,
    faHouseChimneyWindow,
    faLink,
} from '@fortawesome/free-solid-svg-icons';
import { api } from '../api';
import { useAuth, useLoad } from '../hooks';
import { formatDate } from '../format';
import { LoadError, PageLoader } from '../components/ui';
import { HousecallSearch } from '../components/HousecallSearch';
import { ProjectQuestions } from '../components/ProjectQuestions';
import {
    BLANK_ANSWERS,
    answerPayload,
    answerProblem,
    asks,
    describeControls,
    describeFinancing,
} from '../components/questionRules';

const TYPE_ICONS = {
    whole_home: faHouseChimney,
    partial_home: faHouseChimneyWindow,
    basic_rebate: faBolt,
};

// One prompt per screen. `required` steps can't be skipped.
const STEPS = [
    {
        key: 'type',
        question: 'What kind of project is this?',
        helper: 'This decides which documents need to be uploaded.',
        required: true,
    },
    {
        key: 'customer',
        question: 'Who is the customer?',
        helper: 'Search Housecall Pro to fill this in, or type it yourself.',
        required: true,
    },
    {
        key: 'questions',
        question: 'A few questions',
        helper: 'These decide which documents are needed. You can change them later.',
        required: true,
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
        Promise.all([
            api.get('/projects/types'),
            api.get('/users'),
            api.get('/housecall/status'),
            api.get('/projects/options'),
        ]),
    );
    if (error) return <LoadError error={error} onRetry={reload} />;
    if (!data) return <PageLoader />;
    return (
        <Wizard
            types={data[0]}
            users={data[1]}
            housecall={data[2].connected}
            options={data[3]}
        />
    );
}

function Wizard({ types, users, housecall, options }) {
    const { user, notifyChange } = useAuth();
    const navigate = useNavigate();
    const [step, setStep] = useState(0);
    const [values, setValues] = useState({
        type: '',
        customerFirstName: '',
        customerLastName: '',
        address: '',
        dueDate: '',
        ownerId: String(user.id),
        note: '',
        housecallCustomerId: null,
        ...BLANK_ANSWERS,
    });
    const [error, setError] = useState(null);
    const [submitting, setSubmitting] = useState(false);
    // When Housecall Pro last filled the customer card (to highlight it).
    const [filledAt, setFilledAt] = useState(0);

    const reviewing = step === STEPS.length;
    const current = STEPS[step];
    const type = types.find((t) => t.id === values.type);
    const owner = users.find((u) => String(u.id) === values.ownerId);

    const set = (key, value) => {
        setValues((v) => ({ ...v, [key]: value }));
        setError(null);
    };

    const next = () => {
        if (current.key === 'customer') {
            const missing = [
                !values.customerFirstName.trim() && 'first name',
                !values.address.trim() && 'address',
            ].filter(Boolean);
            if (missing.length) {
                setError(
                    `Please enter the customer's ${missing.join(' and ')}.`,
                );
                return;
            }
        } else if (current.key === 'questions') {
            const problem = answerProblem(type, values);
            if (problem) {
                setError(problem);
                return;
            }
        } else if (current.required && !String(values[current.key]).trim()) {
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
                ...answerPayload(type, values),
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
                        {current.key === 'questions' ? (
                            <ProjectQuestions
                                type={type}
                                values={values}
                                onChange={set}
                                options={options}
                            />
                        ) : current.key === 'customer' ? (
                            <>
                                {housecall && (
                                    <HousecallSearch
                                        onPick={(customer) => {
                                            setValues((v) => ({
                                                ...v,
                                                customerFirstName:
                                                    customer.firstName,
                                                customerLastName:
                                                    customer.lastName,
                                                address: customer.address,
                                                housecallCustomerId:
                                                    customer.customerId,
                                            }));
                                            setFilledAt(Date.now());
                                            setError(null);
                                        }}
                                    />
                                )}
                                <CustomerCard
                                    key={filledAt}
                                    values={values}
                                    onChange={set}
                                    justFilled={filledAt > 0}
                                    autoFocus={!housecall}
                                />
                            </>
                        ) : (
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
                        )}
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
    housecall: PropTypes.bool,
    options: PropTypes.object.isRequired,
};

// First name, last name and address together, so it's clear what
// Housecall Pro filled in. Everything stays editable.
function CustomerCard({ values, onChange, justFilled, autoFocus }) {
    const linked = Boolean(values.housecallCustomerId);
    return (
        <div className={`customer-card ${justFilled ? 'just-filled' : ''}`}>
            <div className="customer-card-head">
                <span className="title">Customer</span>
                {linked && (
                    <span className="hcp-chip">
                        <FontAwesomeIcon icon={faLink} className="me-1" />
                        Linked to Housecall Pro
                    </span>
                )}
            </div>
            <div className="row g-3">
                <Form.Group className="col-sm-6" controlId="customerFirstName">
                    <Form.Label>First name</Form.Label>
                    <Form.Control
                        value={values.customerFirstName}
                        onChange={(e) =>
                            onChange('customerFirstName', e.target.value)
                        }
                        maxLength={100}
                        autoComplete="off"
                        autoFocus={autoFocus}
                    />
                </Form.Group>
                <Form.Group className="col-sm-6" controlId="customerLastName">
                    <Form.Label>Last name</Form.Label>
                    <Form.Control
                        value={values.customerLastName}
                        onChange={(e) =>
                            onChange('customerLastName', e.target.value)
                        }
                        maxLength={100}
                        autoComplete="off"
                    />
                </Form.Group>
                <Form.Group className="col-12" controlId="customerAddress">
                    <Form.Label>Job address</Form.Label>
                    <Form.Control
                        value={values.address}
                        onChange={(e) => onChange('address', e.target.value)}
                        maxLength={300}
                        autoComplete="off"
                    />
                </Form.Group>
            </div>
            <div className="form-text mt-2">
                For a business, put its name in First name and leave Last name
                blank.
            </div>
        </div>
    );
}

CustomerCard.propTypes = {
    values: PropTypes.object.isRequired,
    onChange: PropTypes.func.isRequired,
    justFilled: PropTypes.bool,
    autoFocus: PropTypes.bool,
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
                                {type.tasks
                                    .map((t) =>
                                        t.onlyIf
                                            ? `${t.name} (if gas heat)`
                                            : t.name,
                                    )
                                    .join(' · ')}
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
        [
            'customer',
            'Customer',
            `${values.customerFirstName} ${values.customerLastName}`.trim(),
        ],
        ['customer', 'Address', values.address],
        [
            'dueDate',
            'Due date',
            values.dueDate ? formatDate(values.dueDate) : '—',
        ],
        ...(asks(type, 'heats_with_gas')
            ? [
                  [
                      'questions',
                      'Natural gas heat',
                      values.heatsWithGas ? 'Yes' : 'No',
                  ],
              ]
            : []),
        ...(asks(type, 'integrated_controls')
            ? [['questions', 'Integrated controls', describeControls(values)]]
            : []),
        ['questions', 'Financing', describeFinancing(values)],
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
                        key={label}
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
            {values.housecallCustomerId && (
                <div className="hcp-linked mt-3">
                    <FontAwesomeIcon icon={faLink} className="me-2" />
                    Linked to this customer in Housecall Pro.
                </div>
            )}
            {type && (
                <div className="mt-4">
                    <div className="form-label">Documents to upload</div>
                    <div className="task-preview">
                        {type.tasks
                            .filter(
                                (t) =>
                                    !t.onlyIf ||
                                    (t.onlyIf === 'heats_with_gas' &&
                                        values.heatsWithGas),
                            )
                            .map((task) => (
                                <span key={task.name}>{task.name}</span>
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

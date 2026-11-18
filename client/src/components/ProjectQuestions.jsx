import PropTypes from 'prop-types';
import ButtonGroup from 'react-bootstrap/ButtonGroup';
import Button from 'react-bootstrap/Button';
import Form from 'react-bootstrap/Form';
import { asks } from './questionRules';

function Choice({ value, options, onChange, label }) {
    return (
        <ButtonGroup aria-label={label} className="choice-group">
            {options.map(([optionValue, optionLabel]) => (
                <Button
                    key={String(optionValue)}
                    variant={
                        value === optionValue ? 'primary' : 'outline-primary'
                    }
                    onClick={() => onChange(optionValue)}
                    aria-pressed={value === optionValue}
                >
                    {optionLabel}
                </Button>
            ))}
        </ButtonGroup>
    );
}

Choice.propTypes = {
    value: PropTypes.any,
    options: PropTypes.array.isRequired,
    onChange: PropTypes.func.isRequired,
    label: PropTypes.string,
};

const YES_NO = [
    [true, 'Yes'],
    [false, 'No'],
];

// The extra questions for a project: natural gas heating (Whole Home),
// integrated controls (Partial Home) and financing (every type).
export function ProjectQuestions({ type, values, onChange, options }) {
    return (
        <div className="questions">
            {asks(type, 'heats_with_gas') && (
                <div className="question-block">
                    <div className="q-label">
                        Does the home heat with natural gas?
                    </div>
                    <div className="q-help">
                        The <strong>electric bill is always required</strong>.
                        The natural gas bill is only needed if the home heats
                        with natural gas, not propane or oil.
                    </div>
                    <Choice
                        label="Heats with natural gas"
                        value={values.heatsWithGas}
                        options={YES_NO}
                        onChange={(v) => onChange('heatsWithGas', v)}
                    />
                </div>
            )}

            {asks(type, 'integrated_controls') && (
                <div className="question-block">
                    <div className="q-label">Integrated controls?</div>
                    <Choice
                        label="Integrated controls"
                        value={values.integratedControls}
                        options={YES_NO}
                        onChange={(v) => onChange('integratedControls', v)}
                    />
                    {values.integratedControls && (
                        <div className="q-follow">
                            <div className="q-sub">Which controls?</div>
                            <Choice
                                label="Controls type"
                                value={values.controlsType}
                                options={options.controlsTypes.map((o) => [
                                    o,
                                    o,
                                ])}
                                onChange={(v) => onChange('controlsType', v)}
                            />
                            {values.controlsType === 'Other' && (
                                <Form.Control
                                    className="mt-2"
                                    placeholder="Name of the controls"
                                    value={values.controlsOther}
                                    onChange={(e) =>
                                        onChange(
                                            'controlsOther',
                                            e.target.value,
                                        )
                                    }
                                    maxLength={100}
                                    aria-label="Name of the controls"
                                />
                            )}
                        </div>
                    )}
                </div>
            )}

            <div className="question-block">
                <div className="q-label">Is the customer financing?</div>
                <Choice
                    label="Financing"
                    value={values.financing}
                    options={YES_NO}
                    onChange={(v) => onChange('financing', v)}
                />
                {values.financing && (
                    <div className="q-follow">
                        <div className="q-sub">Who is the provider?</div>
                        <Choice
                            label="Financing provider"
                            value={values.financingProvider}
                            options={options.financingProviders.map((o) => [
                                o,
                                o,
                            ])}
                            onChange={(v) => onChange('financingProvider', v)}
                        />
                        {values.financingProvider === 'Other' && (
                            <Form.Control
                                className="mt-2"
                                placeholder="Provider name"
                                value={values.financingOther}
                                onChange={(e) =>
                                    onChange('financingOther', e.target.value)
                                }
                                maxLength={100}
                                aria-label="Financing provider name"
                            />
                        )}
                    </div>
                )}
            </div>
        </div>
    );
}

ProjectQuestions.propTypes = {
    type: PropTypes.object,
    values: PropTypes.object.isRequired,
    onChange: PropTypes.func.isRequired,
    options: PropTypes.shape({
        financingProviders: PropTypes.array.isRequired,
        controlsTypes: PropTypes.array.isRequired,
    }).isRequired,
};

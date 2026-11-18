// Which questions each project type asks, and what's missing from the
// answers. Mirrors the server's rules (backend/src/history.js).
export const BLANK_ANSWERS = {
    financing: null,
    financingProvider: '',
    financingOther: '',
    heatsWithGas: null,
    integratedControls: null,
    controlsType: '',
    controlsOther: '',
};

export function asks(type, question) {
    return Boolean(type?.asks?.includes(question));
}

export function answerProblem(type, a) {
    if (asks(type, 'heats_with_gas') && a.heatsWithGas === null)
        return 'Say whether the home heats with natural gas.';
    if (asks(type, 'integrated_controls')) {
        if (a.integratedControls === null)
            return 'Say whether there are integrated controls.';
        if (a.integratedControls && !a.controlsType)
            return 'Choose the type of integrated controls.';
        if (
            a.integratedControls &&
            a.controlsType === 'Other' &&
            !a.controlsOther.trim()
        )
            return 'Enter the name of the controls.';
    }
    if (a.financing === null) return 'Say whether the customer is financing.';
    if (a.financing && !a.financingProvider)
        return 'Choose the financing provider.';
    if (
        a.financing &&
        a.financingProvider === 'Other' &&
        !a.financingOther.trim()
    )
        return "Enter the financing provider's name.";
    return null;
}

// The answers as the API expects them. Questions this type doesn't ask
// are left out; follow-ups that don't apply are cleared.
export function answerPayload(type, a) {
    const financing = Boolean(a.financing);
    const controls = asks(type, 'integrated_controls')
        ? Boolean(a.integratedControls)
        : null;
    return {
        financing,
        financingProvider: financing ? a.financingProvider : null,
        financingOther:
            financing && a.financingProvider === 'Other'
                ? a.financingOther.trim()
                : '',
        ...(asks(type, 'heats_with_gas') && {
            heatsWithGas: Boolean(a.heatsWithGas),
        }),
        ...(controls !== null && {
            integratedControls: controls,
            controlsType: controls ? a.controlsType : null,
            controlsOther:
                controls && a.controlsType === 'Other'
                    ? a.controlsOther.trim()
                    : '',
        }),
    };
}

export function describeFinancing(a) {
    if (!a.financing) return 'No';
    return a.financingProvider === 'Other'
        ? `Yes, ${a.financingOther}`
        : `Yes, ${a.financingProvider}`;
}

export function describeControls(a) {
    if (!a.integratedControls) return 'No';
    return a.controlsType === 'Other'
        ? `Yes, ${a.controlsOther}`
        : `Yes, ${a.controlsType}`;
}

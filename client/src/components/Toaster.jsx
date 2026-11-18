import { useCallback, useRef, useState } from 'react';
import PropTypes from 'prop-types';
import { FontAwesomeIcon } from '@fortawesome/react-fontawesome';
import {
    faCircleCheck,
    faCircleExclamation,
    faXmark,
} from '@fortawesome/free-solid-svg-icons';
import { ToastContext } from '../toastContext';

const SHOW_FOR_MS = 5000;

// Short notices that appear at the top of the screen and fade on their own.
export function ToastProvider({ children }) {
    const [toasts, setToasts] = useState([]);
    const nextId = useRef(1);

    const dismiss = useCallback(
        (id) => setToasts((all) => all.filter((t) => t.id !== id)),
        [],
    );

    const showToast = useCallback(
        (message, { tone = 'success' } = {}) => {
            const id = nextId.current++;
            setToasts((all) => [...all.slice(-2), { id, message, tone }]);
            setTimeout(() => dismiss(id), SHOW_FOR_MS);
        },
        [dismiss],
    );

    return (
        <ToastContext.Provider value={showToast}>
            {children}
            <div className="toasts" role="status" aria-live="polite">
                {toasts.map((t) => (
                    <div key={t.id} className={`toast-pill ${t.tone}`}>
                        <FontAwesomeIcon
                            icon={
                                t.tone === 'warning'
                                    ? faCircleExclamation
                                    : faCircleCheck
                            }
                        />
                        <span>{t.message}</span>
                        <button
                            type="button"
                            onClick={() => dismiss(t.id)}
                            aria-label="Dismiss"
                        >
                            <FontAwesomeIcon icon={faXmark} />
                        </button>
                    </div>
                ))}
            </div>
        </ToastContext.Provider>
    );
}

ToastProvider.propTypes = { children: PropTypes.node };

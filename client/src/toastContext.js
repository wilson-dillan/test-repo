import { createContext, useContext } from 'react';

export const ToastContext = createContext(() => {});

// showToast(message, { tone: 'success' | 'warning' }) shows a short
// notice at the top of the screen.
export function useToast() {
    return useContext(ToastContext);
}

// The notice after reassigning a task, from the API's `assignmentEmail`.
export function announceAssignment(showToast, notice) {
    if (!notice) return;
    if (notice.email)
        showToast(`Email sent to ${notice.name} (${notice.email})`);
    else
        showToast(
            `Reassigned to ${notice.name}. No email sent: ${notice.reason}.`,
            {
                tone: 'warning',
            },
        );
}

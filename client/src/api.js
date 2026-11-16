export class ApiError extends Error {
    constructor(status, message) {
        super(message);
        this.status = status;
    }
}

// Called whenever the server says the session is gone, so the app can
// return to the login screen.
let onUnauthorized = () => {};
export function setUnauthorizedHandler(handler) {
    onUnauthorized = handler;
}

export async function api(path, { method = 'GET', body } = {}) {
    const isForm = body instanceof FormData;
    const res = await fetch(`/api${path}`, {
        method,
        headers: body && !isForm ? { 'Content-Type': 'application/json' } : {},
        body: body && (isForm ? body : JSON.stringify(body)),
    });

    if (res.status === 204) return null;
    const data = await res.json().catch(() => null);
    if (!res.ok) {
        if (res.status === 401 && path !== '/auth/login') onUnauthorized();
        throw new ApiError(
            res.status,
            data?.error || 'Something went wrong. Please try again.',
        );
    }
    return data;
}

api.get = (path) => api(path);
api.post = (path, body) => api(path, { method: 'POST', body });
api.patch = (path, body) => api(path, { method: 'PATCH', body });
api.del = (path, body) => api(path, { method: 'DELETE', body });

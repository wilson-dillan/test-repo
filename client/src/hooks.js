import { useCallback, useContext, useEffect, useState } from 'react';
import { AuthContext } from './authContext';

export function useAuth() {
    return useContext(AuthContext);
}

// Loads data from the API and reloads it whenever `deps` change or any
// part of the app reports a change (see notifyChange).
export function useLoad(load, deps = []) {
    const { version } = useAuth();
    const [state, setState] = useState({
        data: undefined,
        error: null,
        loading: true,
    });
    const [nonce, setNonce] = useState(0);

    useEffect(() => {
        let cancelled = false;
        setState((s) => ({ ...s, loading: true, error: null }));
        load()
            .then((data) => {
                if (!cancelled) setState({ data, error: null, loading: false });
            })
            .catch((error) => {
                if (!cancelled)
                    setState((s) => ({ ...s, error, loading: false }));
            });
        return () => {
            cancelled = true;
        };
        // eslint-disable-next-line react-hooks/exhaustive-deps
    }, [...deps, version, nonce]);

    const reload = useCallback(() => setNonce((n) => n + 1), []);
    const setData = useCallback(
        (data) => setState((s) => ({ ...s, data })),
        [],
    );
    return { ...state, reload, setData };
}

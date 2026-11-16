import { useCallback, useEffect, useState } from 'react';
import PropTypes from 'prop-types';
import { api, setUnauthorizedHandler } from './api';
import { AuthContext } from './authContext';

export function AuthProvider({ children }) {
    // undefined = still checking, null = logged out
    const [user, setUser] = useState(undefined);
    // Bumped after any change so open pages and panels can refresh.
    const [version, setVersion] = useState(0);

    useEffect(() => {
        setUnauthorizedHandler(() => setUser(null));
        api.get('/auth/me')
            .then(setUser)
            .catch(() => setUser(null));
    }, []);

    const login = useCallback(async (username, password) => {
        setUser(await api.post('/auth/login', { username, password }));
    }, []);

    const logout = useCallback(async () => {
        await api.post('/auth/logout').catch(() => {});
        setUser(null);
    }, []);

    const notifyChange = useCallback(() => setVersion((v) => v + 1), []);

    // For flows that log the user in themselves (e.g. setting a password).
    const signedIn = useCallback((nextUser) => setUser(nextUser), []);

    return (
        <AuthContext.Provider
            value={{ user, login, logout, signedIn, version, notifyChange }}
        >
            {children}
        </AuthContext.Provider>
    );
}

AuthProvider.propTypes = {
    children: PropTypes.node,
};

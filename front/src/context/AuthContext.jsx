import { createContext, useContext, useState, useEffect, useCallback } from 'react';
import { getStoredSession, persistSession, clearSession } from '../session';
import { resolveApiUrl } from '../lib/api';

const AuthContext = createContext(null);

export function AuthProvider({ children }) {
    // Initializer wrapper to safely handle errors during session retrieval
    const [session, setSession] = useState(() => {
        try {
            return getStoredSession();
        } catch (e) {
            console.error('Failed to load session:', e);
            return null;
        }
    });

    useEffect(() => {
        persistSession(session);
    }, [session]);

    const login = useCallback((newSession) => {
        setSession(newSession);
    }, []);

    const logout = useCallback(async () => {
        const s = getStoredSession();
        
        // Clear local session immediately
        clearSession();
        setSession(null);

        try {
            if (s?.token) {
                const apiUrl = resolveApiUrl();
                await fetch(`${apiUrl}/api/logout`, {
                    method: 'POST',
                    headers: { Authorization: `Bearer ${s.token}` }
                }).catch(() => {});
            }
        } catch {}
    }, []);

    const value = {
        user: session?.user,
        token: session?.token,
        session,
        login,
        logout,
        isAuthenticated: !!session
    };

    return <AuthContext.Provider value={value}>{children}</AuthContext.Provider>;
}

export function useAuth() {
    const context = useContext(AuthContext);
    if (context === null) {
        // Allow usage without provider for now to prevent crashes if not wrapped yet, 
        // but ideally should throw or return null.
        // Given existing code might be using it, returning {} might be safer temporarily,
        // but standard is to throw.
        // However, since I'm about to wrap App, throwing is fine.
        // Actually, let's return a safe default if context is missing to avoid white screen of death during refactor.
        return { user: null, token: null, session: null, login: () => {}, logout: () => {}, isAuthenticated: false };
    }
    return context;
}

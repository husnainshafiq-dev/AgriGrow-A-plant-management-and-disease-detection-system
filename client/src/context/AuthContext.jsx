import { createContext, useContext, useState, useEffect, useCallback } from "react";

const AuthContext = createContext(null);

export function AuthProvider({ children }) {
    const [user, setUser] = useState(null);
    const [token, setToken] = useState(() => localStorage.getItem("agrigrow_token"));
    const [loading, setLoading] = useState(true);

    const isAuthenticated = !!user && !!token;

    /* ── helpers ───────────────────────────────────── */
    const saveToken = (t) => {
        localStorage.setItem("agrigrow_token", t);
        setToken(t);
    };

    const clearAuth = useCallback(() => {
        localStorage.removeItem("agrigrow_token");
        setToken(null);
        setUser(null);
    }, []);

    const authHeaders = useCallback(() => {
        const t = token || localStorage.getItem("agrigrow_token");
        return t ? { Authorization: `Bearer ${t}` } : {};
    }, [token]);

    /* ── validate stored token on mount ────────────── */
    useEffect(() => {
        const stored = localStorage.getItem("agrigrow_token");
        if (!stored) { setLoading(false); return; }

        (async () => {
            try {
                const res = await fetch("/api/auth/me", {
                    headers: { Authorization: `Bearer ${stored}` },
                    credentials: "include",
                });
                if (res.ok) {
                    const data = await res.json();
                    const user = data.data?.user || data.user || data.data || data;
                    setUser(user);
                    setToken(stored);
                } else {
                    clearAuth();
                }
            } catch {
                /* network error — keep token, try again later */
            } finally {
                setLoading(false);
            }
        })();
    }, []); // eslint-disable-line react-hooks/exhaustive-deps

    /* ── login ─────────────────────────────────────── */
    const login = useCallback(async (email, password) => {
        const res = await fetch("/api/auth/login", {
            method: "POST",
            headers: { "Content-Type": "application/json" },
            credentials: "include",
            body: JSON.stringify({ email, password }),
        });
        const data = await res.json();
        if (!res.ok) throw new Error(data.error || data.message || "Login failed");
        
        const token = data.data?.token || data.token;
        const user = data.data?.user || data.user || data.data || data;
        
        saveToken(token);
        setUser(user);
        return data;
    }, []);

    /* ── register ──────────────────────────────────── */
    const register = useCallback(async (formData) => {
        const res = await fetch("/api/auth/register", {
            method: "POST",
            headers: { "Content-Type": "application/json" },
            credentials: "include",
            body: JSON.stringify(formData),
        });
        const data = await res.json();
        if (!res.ok) throw new Error(data.error || data.message || "Registration failed");
        
        const token = data.data?.token || data.token;
        const user = data.data?.user || data.user || data.data || data;
        
        saveToken(token);
        setUser(user);
        return data;
    }, []);

    /* ── logout ────────────────────────────────────── */
    const logout = useCallback(async () => {
        try {
            await fetch("/api/auth/logout", {
                method: "POST",
                headers: { ...authHeaders() },
                credentials: "include",
            });
        } catch { /* ignore */ }
        clearAuth();
    }, [authHeaders, clearAuth]);

    /* ── update profile ────────────────────────────── */
    const updateProfile = useCallback(async (profileData) => {
        const res = await fetch("/api/auth/profile", {
            method: "PUT",
            headers: { "Content-Type": "application/json", ...authHeaders() },
            credentials: "include",
            body: JSON.stringify(profileData),
        });
        const data = await res.json();
        if (!res.ok) throw new Error(data.error || data.message || "Update failed");
        
        const user = data.data?.user || data.user || data.data || data;
        setUser(user);
        return data;
    }, [authHeaders]);

    /* ── change password ───────────────────────────── */
    const changePassword = useCallback(async (currentPassword, newPassword, confirmNewPassword) => {
        const res = await fetch("/api/auth/password", {
            method: "PUT",
            headers: { "Content-Type": "application/json", ...authHeaders() },
            credentials: "include",
            body: JSON.stringify({ currentPassword, newPassword, confirmNewPassword }),
        });
        const data = await res.json();
        if (!res.ok) throw new Error(data.error || data.message || "Password change failed");
        
        const token = data.data?.token || data.token;
        if (token) saveToken(token);
        return data;
    }, [authHeaders]);

    const value = {
        user,
        token,
        loading,
        isAuthenticated,
        login,
        register,
        logout,
        updateProfile,
        changePassword,
        authHeaders,
    };

    return <AuthContext.Provider value={value}>{children}</AuthContext.Provider>;
}

export function useAuth() {
    const ctx = useContext(AuthContext);
    if (!ctx) throw new Error("useAuth must be used within AuthProvider");
    return ctx;
}

export default AuthContext;

import { createContext, useContext, useState, useEffect, useCallback } from "react";

const AuthContext = createContext(null);

/* ── Safe response parser ─────────────────────────
 * `response.json()` throws "Unexpected end of JSON input" when the body
 * is empty (e.g. backend down, proxy 504, or HTML error page).
 * This helper returns a friendly error instead of letting that bubble up.
 * ───────────────────────────────────────────────── */
async function parseResponse(res, fallbackError) {
    // No body at all — server didn't reply, or proxy returned empty
    const contentType = res.headers.get("content-type") || "";
    if (!contentType.includes("application/json")) {
        if (res.status === 0 || !res.status) {
            throw new Error("Cannot reach the server. Is the backend running on port 5000?");
        }
        if (res.status >= 500) {
            throw new Error(`Server error (${res.status}). Please try again in a moment.`);
        }
        if (res.status === 404) {
            throw new Error("API endpoint not found. Check the server URL.");
        }
        throw new Error(fallbackError);
    }

    // Body is JSON — read it as text first so empty bodies don't throw
    const text = await res.text();
    if (!text) {
        if (res.status === 401 || res.status === 400) {
            throw new Error(fallbackError);
        }
        throw new Error("Server returned an empty response. Please try again.");
    }

    try {
        return JSON.parse(text);
    } catch {
        // JSON.parse failed — body said it was JSON but wasn't
        throw new Error("Server returned an invalid response. Please try again.");
    }
}

export function AuthProvider({ children }) {
    const [user, setUser] = useState(() => {
        try {
            const stored = localStorage.getItem("agrigrow_user");
            return stored ? JSON.parse(stored) : null;
        } catch {
            return null;
        }
    });
    const [token, setToken] = useState(() => localStorage.getItem("agrigrow_token"));
    const [loading, setLoading] = useState(true);

    const isAuthenticated = !!user && !!token;

    /* ── helpers ───────────────────────────────────── */
    const saveToken = (t) => {
        localStorage.setItem("agrigrow_token", t);
        setToken(t);
    };

    const saveUser = useCallback((u) => {
        setUser(u);
        try {
            if (u) {
                localStorage.setItem("agrigrow_user", JSON.stringify(u));
            } else {
                localStorage.removeItem("agrigrow_user");
            }
        } catch (e) {}
    }, []);

    const clearAuth = useCallback(() => {
        localStorage.removeItem("agrigrow_token");
        localStorage.removeItem("agrigrow_user");
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
                    const data = await parseResponse(res, "Session expired");
                    const fetchedUser = data.data?.user || data.user || data.data || data;

                    // Preserve cached base64 avatar if server returns empty or ephemeral /uploads/ path
                    let cachedAvatar = "";
                    try {
                        const cached = JSON.parse(localStorage.getItem("agrigrow_user") || "{}");
                        cachedAvatar = cached.avatar || "";
                    } catch (e) {}

                    if ((!fetchedUser.avatar || fetchedUser.avatar.startsWith("/uploads")) && cachedAvatar && cachedAvatar.startsWith("data:image/")) {
                        fetchedUser.avatar = cachedAvatar;
                    }

                    saveUser(fetchedUser);
                    setToken(stored);
                } else {
                    clearAuth();
                }
            } catch {
                /* network error — keep token and cached user, try again later */
            } finally {
                setLoading(false);
            }
        })();
    }, [clearAuth, saveUser]);

    /* ── login ─────────────────────────────────────── */
    const login = useCallback(async (email, password) => {
        let res;
        try {
            res = await fetch("/api/auth/login", {
                method: "POST",
                headers: { "Content-Type": "application/json" },
                credentials: "include",
                body: JSON.stringify({ email, password }),
            });
        } catch (networkErr) {
            // fetch itself failed (server unreachable, CORS, offline, etc.)
            throw new Error("Cannot reach the server. Is the backend running on port 5000?");
        }
        const data = await parseResponse(res, "Invalid email or password");
        if (!res.ok) throw new Error(data.error || data.message || "Invalid email or password");

        const token = data.data?.token || data.token;
        const loggedInUser = data.data?.user || data.user || data.data || data;

        saveToken(token);
        saveUser(loggedInUser);
        return data;
    }, [saveUser]);

    /* ── register ──────────────────────────────────── */
    const register = useCallback(async (formData) => {
        let res;
        try {
            res = await fetch("/api/auth/register", {
                method: "POST",
                headers: { "Content-Type": "application/json" },
                credentials: "include",
                body: JSON.stringify(formData),
            });
        } catch (networkErr) {
            throw new Error("Cannot reach the server. Is the backend running on port 5000?");
        }
        const data = await parseResponse(res, "Registration failed");
        if (!res.ok) throw new Error(data.error || data.message || "Registration failed");

        const token = data.data?.token || data.token;
        const user = data.data?.user || data.user || data.data || data;

        saveToken(token);
        saveUser(user);
        return data;
    }, [saveUser]);

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
        let res;
        try {
            res = await fetch("/api/auth/profile", {
                method: "PUT",
                headers: { "Content-Type": "application/json", ...authHeaders() },
                credentials: "include",
                body: JSON.stringify(profileData),
            });
        } catch {
            throw new Error("Cannot reach the server. Is the backend running on port 5000?");
        }
        const data = await parseResponse(res, "Update failed");
        if (!res.ok) throw new Error(data.error || data.message || "Update failed");

        const user = data.data?.user || data.user || data.data || data;
        if (profileData?.avatar && profileData.avatar.startsWith("data:image/")) {
            user.avatar = profileData.avatar;
        }
        saveUser(user);
        return data;
    }, [authHeaders, saveUser]);

    /* ── change password ───────────────────────────── */
    const changePassword = useCallback(async (currentPassword, newPassword, confirmNewPassword) => {
        let res;
        try {
            res = await fetch("/api/auth/password", {
                method: "PUT",
                headers: { "Content-Type": "application/json", ...authHeaders() },
                credentials: "include",
                body: JSON.stringify({ currentPassword, newPassword, confirmNewPassword }),
            });
        } catch {
            throw new Error("Cannot reach the server. Is the backend running on port 5000?");
        }
        const data = await parseResponse(res, "Password change failed");
        if (!res.ok) throw new Error(data.error || data.message || "Password change failed");

        const token = data.data?.token || data.token;
        if (token) saveToken(token);
        return data;
    }, [authHeaders]);

    const updateUser = useCallback((updatedUser) => {
        setUser((prev) => {
            const next = typeof updatedUser === "function" ? updatedUser(prev) : { ...prev, ...updatedUser };
            try {
                if (next) localStorage.setItem("agrigrow_user", JSON.stringify(next));
            } catch (e) {}
            return next;
        });
    }, []);

    const value = {
        user,
        setUser,
        updateUser,
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

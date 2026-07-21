import { Navigate, useLocation } from "react-router-dom";
import { useAuth } from "../context/AuthContext";

export default function ProtectedRoute({ children }) {
    const { isAuthenticated, loading } = useAuth();
    const location = useLocation();

    if (loading) {
        return (
            <div style={{
                display: "flex", 
                justifyContent: "center", 
                alignItems: "center", 
                height: "100vh", 
                backgroundColor: "#030712",
                color: "#f8fafc",
                flexDirection: "column",
                gap: "16px",
                fontFamily: "'Outfit', sans-serif"
            }}>
                <div className="spinner" style={{
                    width: "40px",
                    height: "40px",
                    border: "3px solid rgba(255, 255, 255, 0.08)",
                    borderTopColor: "#10b981",
                    borderRadius: "50%",
                    animation: "spin 1s linear infinite"
                }} />
                <span>Verifying session...</span>
            </div>
        );
    }

    if (!isAuthenticated) {
        return <Navigate to={`/login?redirect=${encodeURIComponent(location.pathname)}`} replace />;
    }

    return children;
}

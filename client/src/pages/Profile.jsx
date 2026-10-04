import { useState, useEffect } from "react";
import { useAuth } from "../context/AuthContext";
import { useLanguage } from "../context/LanguageContext";
import { getAvatarUrl } from "../main";
import "./Profile.css";

// Helper: resize image on client to compact base64 JPEG (< 30KB) for permanent MongoDB persistence
function resizeImageToDataUrl(file, maxSize = 256, quality = 0.85) {
    return new Promise((resolve, reject) => {
        const reader = new FileReader();
        reader.onload = (e) => {
            const img = new Image();
            img.onload = () => {
                const canvas = document.createElement("canvas");
                let width = img.width;
                let height = img.height;
                if (width > height) {
                    if (width > maxSize) {
                        height = Math.round((height * maxSize) / width);
                        width = maxSize;
                    }
                } else {
                    if (height > maxSize) {
                        width = Math.round((width * maxSize) / height);
                        height = maxSize;
                    }
                }
                canvas.width = width;
                canvas.height = height;
                const ctx = canvas.getContext("2d");
                ctx.drawImage(img, 0, 0, width, height);
                resolve(canvas.toDataURL("image/jpeg", quality));
            };
            img.onerror = reject;
            img.src = e.target.result;
        };
        reader.onerror = reject;
        reader.readAsDataURL(file);
    });
}

export default function Profile() {
    const { user, authHeaders, updateProfile, updateUser } = useAuth();
    const { t } = useLanguage();

    const [isEditing, setIsEditing] = useState(false);
    const [name, setName] = useState(user ? user.name : "");
    const [phone, setPhone] = useState(user ? user.phone : "");
    const [bio, setBio] = useState(user ? user.bio || "" : "");
    const [experience, setExperience] = useState(user ? user.experience || 0 : 0);
    const [farmingType, setFarmingType] = useState(user ? user.farmingType || "" : "");
    const [landArea, setLandArea] = useState(user ? user.totalLandArea?.value || 0 : 0);
    const [landUnit, setLandUnit] = useState(user ? user.totalLandArea?.unit || "acres" : "acres");
    const [specializations, setSpecializations] = useState(user ? user.specializations?.join(", ") || "" : "");

    const [avatarFile, setAvatarFile] = useState(null);
    const [avatarPreview, setAvatarPreview] = useState(user ? user.avatar : "");
    const [uploadingAvatar, setUploadingAvatar] = useState(false);
    const [statusMsg, setStatusMsg] = useState("");

    // Stats
    const [farmsCount, setFarmsCount] = useState(0);

    const fetchFarms = async () => {
        try {
            const res = await fetch("/api/farms", {
                headers: authHeaders(),
                credentials: "include"
            });
            if (res.ok) {
                const data = await res.json();
                setFarmsCount(data.data ? data.data.length : 0);
            }
        } catch (err) {
            console.error("Failed to fetch farms count:", err);
        }
    };

    useEffect(() => {
        if (user) {
            setName(user.name);
            setPhone(user.phone || "");
            setBio(user.bio || "");
            setExperience(user.experience || 0);
            setFarmingType(user.farmingType || "");
            setLandArea(user.totalLandArea?.value || 0);
            setLandUnit(user.totalLandArea?.unit || "acres");
            setSpecializations(user.specializations?.join(", ") || "");
            setAvatarPreview(user.avatar || "");
        }
        fetchFarms();
    }, [user]); // eslint-disable-line react-hooks/exhaustive-deps

    const handleAvatarChange = async (e) => {
        const file = e.target.files[0];
        if (!file) return;

        // Check file type
        if (!file.type.startsWith("image/")) {
            setStatusMsg("Please select an image file (JPEG, PNG, or WebP).");
            setTimeout(() => setStatusMsg(""), 3000);
            return;
        }

        // Check file size (max 8 MB)
        if (file.size > 8 * 1024 * 1024) {
            setStatusMsg("Image exceeds 8 MB. Please select a smaller photo.");
            setTimeout(() => setStatusMsg(""), 3000);
            return;
        }

        // Show immediate local preview
        const reader = new FileReader();
        reader.onload = (ev) => setAvatarPreview(ev.target.result);
        reader.readAsDataURL(file);

        // Upload and save photo
        setUploadingAvatar(true);
        setStatusMsg("Saving profile photo...");

        try {
            // Compress image to compact base64 JPEG (< 25KB)
            const compressedBase64 = await resizeImageToDataUrl(file);
            setAvatarPreview(compressedBase64);

            // 1. Direct MongoDB update via updateProfile (persists permanently in Atlas across Render restarts)
            await updateProfile({ avatar: compressedBase64 });
            updateUser((prev) => ({ ...prev, avatar: compressedBase64 }));

            // 2. Also send to avatar file upload endpoint if online
            const fd = new FormData();
            fd.append("avatar", file);
            fetch("/api/auth/profile/avatar", {
                method: "POST",
                headers: authHeaders(),
                credentials: "include",
                body: fd
            }).catch(() => {});

            setStatusMsg("Profile photo updated successfully!");
            setAvatarFile(null);
        } catch (err) {
            console.error("Avatar save failed:", err);
            setStatusMsg("Failed to save photo: " + (err.message || "Connection error"));
            setAvatarPreview(user?.avatar || "");
        } finally {
            setUploadingAvatar(false);
            setTimeout(() => setStatusMsg(""), 4000);
        }
    };

    const handleRemoveAvatar = async () => {
        if (!user?.avatar) return;
        setUploadingAvatar(true);
        setStatusMsg("Removing photo...");
        try {
            await updateProfile({ avatar: "" });
            setAvatarPreview("");
            updateUser((prev) => ({ ...prev, avatar: "" }));
            setStatusMsg("Profile photo removed.");
        } catch (err) {
            setStatusMsg(err.message || "Failed to remove photo.");
        } finally {
            setUploadingAvatar(false);
            setTimeout(() => setStatusMsg(""), 3000);
        }
    };

    const handleSaveProfile = async (e) => {
        e.preventDefault();
        setStatusMsg("");
        try {
            const specsArray = specializations.split(",").map(s => s.trim()).filter(Boolean);
            
            await updateProfile({
                name,
                phone,
                bio,
                experience: Number(experience),
                farmingType,
                totalLandArea: {
                    value: Number(landArea),
                    unit: landUnit
                },
                specializations: specsArray
            });
            
            setStatusMsg("Profile updated successfully!");
            setIsEditing(false);
        } catch (err) {
            setStatusMsg(err.message || "Failed to update profile");
        } finally {
            setTimeout(() => setStatusMsg(""), 3000);
        }
    };

    return (
        <div className="profile-page">
            <div className="bg-blobs">
                <div className="blob blob-2"></div>
                <div className="blob blob-3"></div>
            </div>

            <div className="profile-content container">
                <div className="profile-grid">
                    
                    {/* Left Panel: Photo & Quick stats */}
                    <div className="profile-left-panel">
                        <div className="avatar-card glass-panel text-center">
                            <div className="avatar-wrapper">
                                <img
                                    src={getAvatarUrl(avatarPreview) || "https://images.unsplash.com/photo-1507003211169-0a1dd7228f2d?w=150&h=150&fit=crop&crop=face"}
                                    alt="Farmer Avatar"
                                    className={`profile-avatar-img ${uploadingAvatar ? "uploading" : ""}`}
                                    onError={(e) => {
                                        e.target.onerror = null;
                                        e.target.src = "https://images.unsplash.com/photo-1507003211169-0a1dd7228f2d?w=150&h=150&fit=crop&crop=face";
                                    }}
                                />
                                <label className="avatar-upload-btn" title="Choose new picture">
                                    {uploadingAvatar ? "⏳" : "📷"}
                                    <input type="file" accept="image/*" hidden onChange={handleAvatarChange} disabled={uploadingAvatar} />
                                </label>
                            </div>
                            
                            {uploadingAvatar && (
                                <p style={{ fontSize: "12px", color: "#10b981", margin: "-10px 0 14px 0", fontWeight: "600" }}>
                                    Uploading photo...
                                </p>
                            )}

                            {user?.avatar && !uploadingAvatar && (
                                <button
                                    type="button"
                                    onClick={handleRemoveAvatar}
                                    className="remove-avatar-btn"
                                    title="Remove current photo"
                                    style={{
                                        background: "none",
                                        border: "none",
                                        color: "#ef4444",
                                        fontSize: "11px",
                                        cursor: "pointer",
                                        margin: "-10px 0 14px 0",
                                        textDecoration: "underline"
                                    }}
                                >
                                    Remove Photo
                                </button>
                            )}

                            <h3 className="profile-name">{user?.name}</h3>
                            <p className="profile-role-badge">
                                {user?.role === "superadmin"
                                    ? "👑 Super Admin"
                                    : user?.role === "admin"
                                    ? "🛡️ Admin Advisor"
                                    : user?.role === "editor"
                                    ? "✏️ Content Editor"
                                    : "🌾 Verified Farmer"}
                            </p>
                            
                            <div className="profile-stats-row">
                                <div className="stat-box">
                                    <span className="stat-num">{farmsCount}</span>
                                    <span className="stat-lbl">Farms</span>
                                </div>
                                <div className="stat-box">
                                    <span className="stat-num">{experience}</span>
                                    <span className="stat-lbl">{t("profile.years")} Exp</span>
                                </div>
                            </div>
                        </div>

                        {statusMsg && <div className="status-banner" style={{ marginTop: "16px" }}>{statusMsg}</div>}
                    </div>

                    {/* Right Panel: Detailed editable fields */}
                    <div className="profile-right-panel">
                        <div className="details-card glass-panel">
                            <div className="details-header">
                                <h3>{t("profile.title")}</h3>
                                <button onClick={() => setIsEditing(!isEditing)} className="btn-read edit-toggle-btn">
                                    {isEditing ? t("common.cancel") : t("common.edit")}
                                </button>
                            </div>

                            {!isEditing ? (
                                <div className="profile-view-details">
                                    <div className="detail-item">
                                        <label>{t("auth.fullName")}</label>
                                        <p>{user?.name}</p>
                                    </div>
                                    <div className="detail-item">
                                        <label>{t("auth.email")}</label>
                                        <p>{user?.email}</p>
                                    </div>
                                    <div className="detail-item">
                                        <label>{t("auth.phone")}</label>
                                        <p>{user?.phone || "—"}</p>
                                    </div>
                                    <div className="detail-item">
                                        <label>{t("profile.bio")}</label>
                                        <p className="bio-view-text">{user?.bio || "No profile bio written yet."}</p>
                                    </div>
                                    <div className="detail-grid">
                                        <div className="detail-item">
                                            <label>{t("profile.experience")}</label>
                                            <p>{user?.experience || 0} {t("profile.years")}</p>
                                        </div>
                                        <div className="detail-item">
                                            <label>{t("profile.farmingType")}</label>
                                            <p style={{ textTransform: "capitalize" }}>{user?.farmingType || "Conventional"}</p>
                                        </div>
                                    </div>
                                    <div className="detail-grid">
                                        <div className="detail-item">
                                            <label>{t("profile.landArea")}</label>
                                            <p>{user?.totalLandArea?.value || 0} {user?.totalLandArea?.unit || "acres"}</p>
                                        </div>
                                        <div className="detail-item">
                                            <label>{t("profile.specializations")}</label>
                                            <p>{user?.specializations?.join(", ") || "General crops"}</p>
                                        </div>
                                    </div>
                                </div>
                            ) : (
                                <form onSubmit={handleSaveProfile} className="profile-edit-form">
                                    <div className="form-group">
                                        <label>{t("auth.fullName")}</label>
                                        <input type="text" required value={name} onChange={(e) => setName(e.target.value)} />
                                    </div>
                                    <div className="form-group">
                                        <label>{t("auth.phone")}</label>
                                        <input type="tel" value={phone} onChange={(e) => setPhone(e.target.value)} />
                                    </div>
                                    <div className="form-group">
                                        <label>{t("profile.bio")}</label>
                                        <textarea rows="3" value={bio} onChange={(e) => setBio(e.target.value)} style={{ resize: "none" }} />
                                    </div>
                                    <div className="form-grid">
                                        <div className="form-group">
                                            <label>{t("profile.experience")} ({t("profile.years")})</label>
                                            <input type="number" min="0" max="80" value={experience} onChange={(e) => setExperience(e.target.value)} />
                                        </div>
                                        <div className="form-group">
                                            <label>{t("profile.farmingType")}</label>
                                            <select value={farmingType} onChange={(e) => setFarmingType(e.target.value)}>
                                                <option value="">Conventional</option>
                                                <option value="organic">Organic</option>
                                                <option value="conventional">Conventional</option>
                                                <option value="mixed">Mixed</option>
                                            </select>
                                        </div>
                                    </div>
                                    <div className="form-grid">
                                        <div className="form-group" style={{ display: "flex", gap: "10px", alignItems: "flex-end" }}>
                                            <div style={{ flex: 1 }}>
                                                <label>{t("profile.landArea")}</label>
                                                <input type="number" min="0" value={landArea} onChange={(e) => setLandArea(e.target.value)} />
                                            </div>
                                            <select value={landUnit} onChange={(e) => setLandUnit(e.target.value)} style={{ width: "100px", padding: "10px" }}>
                                                <option value="acres">acres</option>
                                                <option value="hectares">hectares</option>
                                                <option value="kanal">kanal</option>
                                            </select>
                                        </div>
                                        <div className="form-group">
                                            <label>{t("profile.specializations")} (comma separated)</label>
                                            <input type="text" placeholder="e.g. Rice, Wheat, Soil Prep" value={specializations} onChange={(e) => setSpecializations(e.target.value)} />
                                        </div>
                                    </div>

                                    <div className="form-actions-row">
                                        <button type="submit" className="btn-primary save-profile-btn">
                                            Save Settings
                                        </button>
                                    </div>
                                </form>
                            )}
                        </div>
                    </div>
                </div>
            </div>
        </div>
    );
}

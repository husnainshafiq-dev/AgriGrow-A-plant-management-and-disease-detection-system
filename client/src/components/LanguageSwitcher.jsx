import { useLanguage } from "../context/LanguageContext";

export default function LanguageSwitcher() {
    const { language, setLanguage } = useLanguage();

    const handleChange = (e) => {
        setLanguage(e.target.value);
    };

    return (
        <div className="language-switcher" style={{ display: "inline-block", position: "relative" }}>
            <select
                value={language}
                onChange={handleChange}
                style={{
                    padding: "6px 12px",
                    background: "rgba(15, 23, 42, 0.65)",
                    border: "1px solid rgba(255, 255, 255, 0.08)",
                    borderRadius: "8px",
                    color: "#f8fafc",
                    fontSize: "13.5px",
                    fontFamily: "'Outfit', sans-serif",
                    cursor: "pointer",
                    outline: "none",
                    backdropFilter: "blur(10px)"
                }}
            >
                <option value="en">🇺🇸 English</option>
                <option value="ur">🇵 Pakistan - اردو</option>
                <option value="pa">🇵 Pakistan - پنجابی</option>
            </select>
        </div>
    );
}

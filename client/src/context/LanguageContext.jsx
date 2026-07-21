import { createContext, useContext, useState, useEffect, useCallback, useMemo } from "react";

const LanguageContext = createContext(null);

/* ── load translations lazily ──────────────────────────────────── */
const translationCache = {};

async function loadTranslations(lang) {
    if (translationCache[lang]) return translationCache[lang];
    try {
        const mod = await import(`../i18n/${lang}.json`);
        translationCache[lang] = mod.default || mod;
        return translationCache[lang];
    } catch {
        console.warn(`Translation file for "${lang}" not found, falling back to English.`);
        if (lang !== "en") return loadTranslations("en");
        return {};
    }
}

/* ── dot-path resolver ─────────────────────────────────────────── */
function resolve(obj, path, fallback) {
    const keys = path.split(".");
    let current = obj;
    for (const key of keys) {
        if (current == null || typeof current !== "object") return fallback;
        current = current[key];
    }
    return current ?? fallback;
}

export function LanguageProvider({ children }) {
    const [language, setLanguageState] = useState(
        () => localStorage.getItem("agrigrow_lang") || "en"
    );
    const [translations, setTranslations] = useState({});
    const [ready, setReady] = useState(false);

    /* ── load translations when language changes ───────────────── */
    useEffect(() => {
        setReady(false);
        loadTranslations(language).then((t) => {
            setTranslations(t);
            setReady(true);
        });

        /* RTL handling */
        const rtlLangs = ["ur", "pa"];
        document.documentElement.dir = rtlLangs.includes(language) ? "rtl" : "ltr";
        document.documentElement.lang = language;
        document.body.classList.toggle("rtl", rtlLangs.includes(language));
    }, [language]);

    /* ── change language ──────────────────────────────────── */
    const setLanguage = useCallback((lang) => {
        localStorage.setItem("agrigrow_lang", lang);
        setLanguageState(lang);
    }, []);

    /* ── translation function ────────────────────────────── */
    const t = useCallback(
        (key, fallback) => {
            return resolve(translations, key, fallback ?? key);
        },
        [translations]
    );

    const isRtl = language === "ur" || language === "pa";

    const value = useMemo(
        () => ({ language, setLanguage, t, isRtl, ready }),
        [language, setLanguage, t, isRtl, ready]
    );

    return (
        <LanguageContext.Provider value={value}>
            {children}
        </LanguageContext.Provider>
    );
}

export function useLanguage() {
    const ctx = useContext(LanguageContext);
    if (!ctx) throw new Error("useLanguage must be used within LanguageProvider");
    return ctx;
}

export default LanguageContext;

import { useBookmarks } from "../context/BookmarkContext";

export default function BookmarkButton({ type, itemId }) {
    const { isBookmarked, toggleBookmark } = useBookmarks();
    const bookmarked = isBookmarked(type, itemId);

    const handleToggle = (e) => {
        e.stopPropagation();
        toggleBookmark(type, itemId);
    };

    return (
        <button
            onClick={handleToggle}
            aria-label={bookmarked ? "Remove Bookmark" : "Add Bookmark"}
            style={{
                background: "none",
                border: "none",
                color: bookmarked ? "#10b981" : "#94a3b8",
                fontSize: "18px",
                cursor: "pointer",
                padding: "4px",
                display: "inline-flex",
                alignItems: "center",
                justifyContent: "center",
                transition: "color 0.2s, transform 0.2s"
            }}
            onMouseEnter={(e) => {
                e.currentTarget.style.transform = "scale(1.15)";
            }}
            onMouseLeave={(e) => {
                e.currentTarget.style.transform = "scale(1)";
            }}
        >
            {bookmarked ? "🔖" : "📑"}
        </button>
    );
}

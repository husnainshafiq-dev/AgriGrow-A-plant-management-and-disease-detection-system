/* ==============================================================
   🗺️ PrecisionMap — Standalone React-Leaflet Map Component
   ==============================================================
   
   Drop-in replacement for the CDN-based Leaflet map.
   Uses react-leaflet (proper React bindings) + OpenStreetMap tiles.

   FEATURES:
     ✅ Leaflet CSS imported properly (no CDN needed)
     ✅ Marker icon paths fixed for React/Vite bundler
     ✅ GPS geolocation with animated fly-to on mount
     ✅ Polygon rendering for field boundaries
     ✅ Safe [Lat, Lng] coordinate handling
     ✅ Multi-provider search (Photon + Nominatim)
     ✅ Tile layer toggle (satellite / street / topo)
     ✅ Click-to-add-point for drawing field boundaries
   
   USAGE:
     import PrecisionMap from './PrecisionMap';
     
     <PrecisionMap
       center={[30.3753, 69.3451]}
       zoom={5}
       fieldBoundary={[]}
       onBoundaryChange={(points) => setPoints(points)}
       onLocationFound={(latlng) => console.log(latlng)}
     />
   ============================================================== */

// ── CRITICAL: Import Leaflet CSS before anything else ────────
import "leaflet/dist/leaflet.css";

import { useState, useEffect, useCallback, useRef } from "react";
import {
    MapContainer,
    TileLayer,
    Polygon,
    Marker,
    Popup,
    useMap,
    useMapEvents,
} from "react-leaflet";
import L from "leaflet";
import "./PrecisionMap.css";

/* ── Fix Leaflet marker icons (broken by bundlers) ───────────── */
delete L.Icon.Default.prototype._getIconUrl;
L.Icon.Default.mergeOptions({
    iconRetinaUrl:
        "https://unpkg.com/leaflet@1.9.4/dist/images/marker-icon-2x.png",
    iconUrl: "https://unpkg.com/leaflet@1.9.4/dist/images/marker-icon.png",
    shadowUrl:
        "https://unpkg.com/leaflet@1.9.4/dist/images/marker-shadow.png",
});

/* ── Custom marker icons ─────────────────────────────────────── */
const searchIcon = L.divIcon({
    className: "pm-search-marker",
    html: '<div class="pm-search-pin">📍</div>',
    iconSize: [32, 32],
    iconAnchor: [16, 32],
});

const userIcon = L.divIcon({
    className: "pm-user-marker",
    html: '<div class="pm-user-dot"></div>',
    iconSize: [20, 20],
    iconAnchor: [10, 10],
});

const vertexIcon = L.divIcon({
    className: "pm-vertex-marker",
    html: '<div class="pm-vertex-dot"></div>',
    iconSize: [12, 12],
    iconAnchor: [6, 6],
});

/* ── Tile layer configurations ───────────────────────────────── */
const TILES = {
    satellite: {
        url: "https://mt1.google.com/vt/lyrs=y&x={x}&y={y}&z={z}",
        attr: "© Google Maps",
        maxNativeZoom: 20,
    },
    street: {
        url: "https://{s}.tile.openstreetmap.org/{z}/{x}/{y}.png",
        attr: '© <a href="https://openstreetmap.org">OpenStreetMap</a>',
        maxNativeZoom: 19,
    },
    topo: {
        url: "https://{s}.tile.opentopomap.org/{z}/{x}/{y}.png",
        attr: "© OpenTopoMap",
        maxNativeZoom: 17,
    },
};

/* ── Safe coordinate parser ──────────────────────────────────── */
/**
 * Strictly parses [lat, lng] and validates ranges.
 * Prevents null-island and GeoJSON [lng, lat] inversion bugs.
 */
function safeLatLng(lat, lng) {
    const la = parseFloat(lat);
    const lo = parseFloat(lng);
    if (isNaN(la) || isNaN(lo)) return null;
    if (la < -90 || la > 90 || lo < -180 || lo > 180) return null;
    return [la, lo];
}

/** Convert GeoJSON [lng, lat] → Leaflet [lat, lng] safely */
function fromGeoJSON(coordinates) {
    if (!coordinates?.[0]) return [];
    return coordinates[0]
        .slice(0, -1)
        .map(([lng, lat]) => safeLatLng(lat, lng))
        .filter(Boolean);
}

/* ══════════════════════════════════════════════════════════════
   CHILD: FlyToLocation
   Dynamically moves the map camera when location changes.
   Must be a child of <MapContainer> to use useMap().
   ══════════════════════════════════════════════════════════════ */
function FlyToLocation({ position, zoom = 16 }) {
    const map = useMap();
    useEffect(() => {
        if (position) {
            map.flyTo(position, zoom, { duration: 1.2 });
        }
    }, [map, position, zoom]);
    return null;
}

/* ══════════════════════════════════════════════════════════════
   CHILD: MapClickHandler
   Handles click events on the map for adding boundary points.
   ══════════════════════════════════════════════════════════════ */
function MapClickHandler({ enabled, onMapClick, onAnyClick }) {
    useMapEvents({
        click(e) {
            onAnyClick?.();
            if (enabled && onMapClick) {
                const point = safeLatLng(e.latlng.lat, e.latlng.lng);
                if (point) onMapClick(point);
            }
        },
        dragstart() {
            onAnyClick?.();
        },
    });
    return null;
}

/* ══════════════════════════════════════════════════════════════
   CHILD: InvalidateSizeOnMount
   Forces Leaflet to recalculate the container size after
   the flex layout is fully computed.
   ══════════════════════════════════════════════════════════════ */
function InvalidateSizeOnMount() {
    const map = useMap();
    useEffect(() => {
        const t1 = setTimeout(() => map.invalidateSize(), 100);
        const t2 = setTimeout(() => map.invalidateSize(), 400);
        const onResize = () => map.invalidateSize();
        window.addEventListener("resize", onResize);

        // let observer;
        // if (window.ResizeObserver) {
        //     observer = new ResizeObserver(() => map.invalidateSize());
        //     observer.observe(map.getContainer());
        // }

        return () => {
            clearTimeout(t1);
            clearTimeout(t2);
            window.removeEventListener("resize", onResize);
            // observer?.disconnect();
        };
    }, [map]);
    return null;
}

/* ══════════════════════════════════════════════════════════════
   MAIN COMPONENT: PrecisionMap
   ══════════════════════════════════════════════════════════════ */
export default function PrecisionMap({
    center = [30.3753, 69.3451], // Pakistan center fallback
    zoom = 5,
    fieldBoundary = [], // Array of [lat, lng] pairs
    fieldColor = "#10B981",
    drawingMode = false,
    onBoundaryChange,
    onLocationFound,
}) {
    /* ── State ────────────────────────────────────────────────── */
    const [tileLayer, setTileLayer] = useState("satellite");
    const [userLocation, setUserLocation] = useState(null);
    const [flyTarget, setFlyTarget] = useState(null);
    const [locating, setLocating] = useState(false);

    // Search state
    const [searchQuery, setSearchQuery] = useState("");
    const [searchResults, setSearchResults] = useState([]);
    const [searchLoading, setSearchLoading] = useState(false);
    const [showDropdown, setShowDropdown] = useState(false);
    const [searchMarker, setSearchMarker] = useState(null);
    const searchTimeout = useRef(null);
    const searchWrapRef = useRef(null);

    /* ── Close search dropdown when clicking anywhere outside (including map) ── */
    useEffect(() => {
        const handleClickOutside = (e) => {
            if (searchWrapRef.current && !searchWrapRef.current.contains(e.target)) {
                setShowDropdown(false);
            }
        };
        document.addEventListener("mousedown", handleClickOutside);
        document.addEventListener("touchstart", handleClickOutside, { passive: true });
        return () => {
            document.removeEventListener("mousedown", handleClickOutside);
            document.removeEventListener("touchstart", handleClickOutside);
        };
    }, []);

    /* ── GPS Geolocation on mount ─────────────────────────────── */
    useEffect(() => {
        if (!navigator.geolocation) return;
        setLocating(true);

        navigator.geolocation.getCurrentPosition(
            (pos) => {
                const loc = safeLatLng(pos.coords.latitude, pos.coords.longitude);
                if (loc) {
                    setUserLocation(loc);
                    setFlyTarget(loc);
                    onLocationFound?.(loc);
                }
                setLocating(false);
            },
            () => setLocating(false),
            { enableHighAccuracy: true, timeout: 15000 }
        );
    }, []);

    /* ── Locate Me button ─────────────────────────────────────── */
    const locateMe = () => {
        if (!navigator.geolocation) return;
        setLocating(true);
        navigator.geolocation.getCurrentPosition(
            (pos) => {
                const loc = safeLatLng(pos.coords.latitude, pos.coords.longitude);
                if (loc) {
                    setUserLocation(loc);
                    setFlyTarget(loc);
                }
                setLocating(false);
            },
            () => setLocating(false),
            { enableHighAccuracy: true, timeout: 15000 }
        );
    };

    /* ── Map click → add boundary point ───────────────────────── */
    const handleMapClick = useCallback(
        (point) => {
            if (!drawingMode) return;
            const updated = [...fieldBoundary, point];
            onBoundaryChange?.(updated);
        },
        [drawingMode, fieldBoundary, onBoundaryChange]
    );

    /* ── Multi-provider Location Search ───────────────────────── */
    const searchLocation = useCallback(async (query) => {
        if (!query || query.trim().length < 2) {
            setSearchResults([]);
            setShowDropdown(false);
            return;
        }

        setSearchLoading(true);
        try {
            const q = query.trim();

            // Query Photon + Nominatim in parallel
            const [photonRes, nominatimRes] = await Promise.allSettled([
                fetch(
                    `https://photon.komoot.io/api/?q=${encodeURIComponent(q)}&limit=12`
                ).then((r) => r.json()),
                fetch(
                    `https://nominatim.openstreetmap.org/search?format=json&q=${encodeURIComponent(q)}&limit=8&addressdetails=1&countrycodes=pk`,
                    { headers: { "Accept-Language": "en" } }
                ).then((r) => r.json()),
            ]);

            const merged = [];

            // Photon results first — FILTER to Pakistan only
            if (photonRes.status === "fulfilled" && photonRes.value?.features) {
                for (const f of photonRes.value.features) {
                    const props = f.properties || {};
                    const [lng, lat] = f.geometry?.coordinates || [0, 0];
                    const loc = safeLatLng(lat, lng);
                    if (!loc) continue;

                    // *** CRITICAL: Only include Pakistan results ***
                    if (props.countrycode && props.countrycode.toUpperCase() !== "PK") continue;

                    const parts = [
                        props.name,
                        props.street,
                        props.city,
                        props.county,
                        props.state,
                        props.country,
                    ].filter(Boolean);

                    merged.push({
                        display_name: parts.join(", "),
                        lat: loc[0],
                        lon: loc[1],
                        type: props.type || props.osm_value || "place",
                        place_id: `photon-${props.osm_id || merged.length}`,
                    });
                }
            }

            // Nominatim results, deduplicated
            if (
                nominatimRes.status === "fulfilled" &&
                Array.isArray(nominatimRes.value)
            ) {
                for (const r of nominatimRes.value) {
                    const lat = parseFloat(r.lat);
                    const lng = parseFloat(r.lon);
                    const isDupe = merged.some(
                        (m) =>
                            Math.abs(m.lat - lat) < 0.01 &&
                            Math.abs(m.lon - lng) < 0.01
                    );
                    if (!isDupe) {
                        merged.push({ ...r });
                    }
                }
            }

            const final8 = merged.slice(0, 8);
            setSearchResults(final8);
            setShowDropdown(final8.length > 0);
        } catch {
            setSearchResults([]);
            setShowDropdown(false);
        }
        setSearchLoading(false);
    }, []);

    const onSearchInput = (value) => {
        setSearchQuery(value);
        if (searchTimeout.current) clearTimeout(searchTimeout.current);
        searchTimeout.current = setTimeout(() => searchLocation(value), 800);
    };

    const selectResult = (r) => {
        const lat = parseFloat(r.lat);
        const lng = parseFloat(r.lon);
        const loc = safeLatLng(lat, lng);
        if (!loc) return;

        setSearchMarker(loc);
        setFlyTarget(loc);
        setSearchQuery(
            r.display_name?.split(",").slice(0, 2).join(", ") || ""
        );
        setShowDropdown(false);
        setSearchResults([]);
    };

    const clearSearch = () => {
        setSearchQuery("");
        setSearchResults([]);
        setShowDropdown(false);
        setSearchMarker(null);
    };

    /* ── Determine map center ─────────────────────────────────── */
    const safeCenter = safeLatLng(center[0], center[1]) || [30.3753, 69.3451];

    /* ── Icon helper for search results ───────────────────────── */
    const typeIcon = (type) => {
        if (type === "city" || type === "town") return "🏙️";
        if (type === "village" || type === "hamlet") return "🏘️";
        if (type === "country") return "🌍";
        if (type === "state" || type === "region" || type === "county")
            return "📍";
        return "📌";
    };

    /* ── Render ────────────────────────────────────────────────── */
    return (
        <div className="pm-container">
            {/* ── THE MAP ──────────────────────────────────────── */}
            <MapContainer
                center={safeCenter}
                zoom={zoom}
                minZoom={3}
                maxZoom={22}
                zoomControl={false}
                attributionControl={true}
                worldCopyJump={true}
                maxBounds={[
                    [-85, -180],
                    [85, 180],
                ]}
                maxBoundsViscosity={1.0}
                className="pm-map"
                style={{ width: "100%", height: "100%" }}
            >
                {/* Tile layer */}
                <TileLayer
                    key={tileLayer}
                    url={TILES[tileLayer].url}
                    attribution={TILES[tileLayer].attr}
                    maxZoom={22}
                    maxNativeZoom={TILES[tileLayer].maxNativeZoom}
                    noWrap={true}
                />

                {/* Dynamic fly-to */}
                <FlyToLocation position={flyTarget} zoom={16} />

                {/* Resize fix */}
                <InvalidateSizeOnMount />

                {/* Click handler for drawing and map interaction */}
                <MapClickHandler
                    enabled={drawingMode}
                    onMapClick={handleMapClick}
                    onAnyClick={() => setShowDropdown(false)}
                />

                {/* Field boundary polygon */}
                {fieldBoundary.length >= 3 && (
                    <Polygon
                        positions={fieldBoundary}
                        pathOptions={{
                            color: fieldColor,
                            fillColor: fieldColor,
                            fillOpacity: 0.15,
                            weight: 2.5,
                        }}
                    />
                )}

                {/* Vertex markers for drawn points */}
                {drawingMode &&
                    fieldBoundary.map((pos, i) => (
                        <Marker key={`v-${i}`} position={pos} icon={vertexIcon} />
                    ))}

                {/* User location marker */}
                {userLocation && (
                    <Marker position={userLocation} icon={userIcon}>
                        <Popup>
                            <strong>Your Location</strong>
                            <br />
                            {userLocation[0].toFixed(4)}°,{" "}
                            {userLocation[1].toFixed(4)}°
                        </Popup>
                    </Marker>
                )}

                {/* Search pin marker */}
                {searchMarker && (
                    <Marker position={searchMarker} icon={searchIcon}>
                        <Popup>
                            <strong>
                                {searchQuery || "Search Result"}
                            </strong>
                            <br />
                            <span style={{ color: "#94a3b8", fontSize: 11 }}>
                                {searchMarker[0].toFixed(4)}°,{" "}
                                {searchMarker[1].toFixed(4)}°
                            </span>
                        </Popup>
                    </Marker>
                )}
            </MapContainer>

            {/* ── OVERLAY CONTROLS ─────────────────────────────── */}

            {/* Search Bar */}
            <div
                ref={searchWrapRef}
                className="pm-search-wrap"
            >
                <div className="pm-search-bar">
                    <span className="pm-search-icon">🔍</span>
                    <input
                        type="text"
                        className="pm-search-input"
                        placeholder="Search city, village, or place..."
                        value={searchQuery}
                        onChange={(e) => onSearchInput(e.target.value)}
                        onFocus={() =>
                            searchResults.length > 0 && setShowDropdown(true)
                        }
                        onClick={() =>
                            searchResults.length > 0 && setShowDropdown(true)
                        }
                        onKeyDown={(e) => {
                            if (e.key === "Enter") {
                                e.preventDefault();
                                searchLocation(searchQuery);
                            }
                            if (e.key === "Escape") setShowDropdown(false);
                        }}
                    />
                    {searchLoading && <span className="pm-spinner" />}
                    {searchQuery && !searchLoading && (
                        <button className="pm-search-clear" onClick={clearSearch}>
                            ×
                        </button>
                    )}
                </div>

                {showDropdown && searchResults.length > 0 && (
                    <div className="pm-search-dropdown">
                        {searchResults.map((r, i) => (
                            <button
                                key={r.place_id || i}
                                className="pm-search-result"
                                onClick={() => selectResult(r)}
                            >
                                <span className="pm-result-icon">
                                    {typeIcon(r.type)}
                                </span>
                                <div className="pm-result-text">
                                    <span className="pm-result-name">
                                        {r.display_name
                                            ?.split(",")
                                            .slice(0, 2)
                                            .join(",")}
                                    </span>
                                    <span className="pm-result-detail">
                                        {r.display_name
                                            ?.split(",")
                                            .slice(2, 4)
                                            .join(",")
                                            .trim()}
                                    </span>
                                </div>
                                <span className="pm-result-type">{r.type}</span>
                            </button>
                        ))}
                    </div>
                )}
            </div>

            {/* Tile Layer Toggle */}
            <div className="pm-tile-toggle">
                {Object.keys(TILES).map((key) => (
                    <button
                        key={key}
                        className={`pm-tile-btn ${tileLayer === key ? "active" : ""}`}
                        onClick={() => setTileLayer(key)}
                        title={key}
                    >
                        {key === "satellite"
                            ? "🛰️"
                            : key === "street"
                                ? "🗺️"
                                : "🏔️"}
                    </button>
                ))}
            </div>

            {/* My Location Button */}
            <button
                className="pm-locate-btn"
                onClick={locateMe}
                disabled={locating}
                title="My Location"
            >
                {locating ? <span className="pm-spinner-sm" /> : "📍"}
            </button>
        </div>
    );
}

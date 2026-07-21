/* ==============================================================
   🗺️ FarmMap — Farm Land Mapping Interface (STEP 5.1)
   ==============================================================
   
   Interactive map component for farm boundary management:
   • Draw farm boundaries as polygons
   • Auto-calculate area in acres/hectares
   • Tag soil type, water source, crop history
   • Display multiple farms on a single map
   • Mobile-responsive with touch gesture support
   
   ARCHITECTURE:
   ┌─────────────────────────────────────────────────┐
   │               FarmMap (this file)               │
   │  ┌─────────────┐  ┌──────────────────────────┐  │
   │  │  MapCanvas   │  │      FarmPanel            │ │
   │  │  (Leaflet)   │  │  ┌──────────────────────┐│ │
   │  │  • Tiles     │  │  │ FarmForm (draw/edit) ││ │
   │  │  • Polygons  │  │  ├──────────────────────┤│ │
   │  │  • Controls  │  │  │ FarmList (all farms) ││ │
   │  │  • Markers   │  │  ├──────────────────────┤│ │
   │  │              │  │  │ FarmDetails (single) ││ │
   │  └─────────────┘  │  └──────────────────────┘│ │
   │                    └──────────────────────────┘  │
   └─────────────────────────────────────────────────┘
   
   WHY LEAFLET (not Google Maps)?
     • Free — no API key required for basic tiles
     • Open-source (BSD-2)
     • ~40KB gzipped vs ~200KB+ for Google Maps SDK
     • First-class polygon drawing via Leaflet.draw
     • Full GeoJSON support (same format as MongoDB)
     • Works offline with cached tiles
     
   If you need Google Maps, replace the tile URL and add
   the Google Maps API key. The polygon/GeoJSON logic is
   identical because both use the same coordinate format.
   ============================================================== */

import { useState, useRef, useEffect, useCallback } from "react";
import L from "leaflet";
import "leaflet/dist/leaflet.css";

/* ── Constants ──────────────────────────────────────────────── */

// Default map center (India — adjust per region)
const DEFAULT_CENTER = [20.5937, 78.9629];
const DEFAULT_ZOOM = 5;
const FARM_ZOOM = 15;

// Leaflet CDN (loaded dynamically)
const LEAFLET_CSS = "https://unpkg.com/leaflet@1.9.4/dist/leaflet.css";
const LEAFLET_JS = "https://unpkg.com/leaflet@1.9.4/dist/leaflet.js";

// OpenStreetMap tiles (free, no API key)
const TILE_URL = "https://{s}.tile.openstreetmap.org/{z}/{x}/{y}.png";
const TILE_ATTR = '&copy; <a href="https://openstreetmap.org">OpenStreetMap</a>';

// Satellite tiles (free via Esri)
const SAT_TILE_URL = "https://server.arcgisonline.com/ArcGIS/rest/services/World_Imagery/MapServer/tile/{z}/{y}/{x}";
const SAT_TILE_ATTR = '&copy; Esri, Maxar, Earthstar Geographics';

// Soil types matching backend
const SOIL_TYPES = [
    { value: "clay", label: "Clay" },
    { value: "sandy", label: "Sandy" },
    { value: "loamy", label: "Loamy" },
    { value: "silt", label: "Silt" },
    { value: "peat", label: "Peat" },
    { value: "chalk", label: "Chalk" },
    { value: "laterite", label: "Laterite" },
    { value: "black-cotton", label: "Black Cotton" },
    { value: "red", label: "Red" },
    { value: "alluvial", label: "Alluvial" },
    { value: "other", label: "Other" },
];

// Water sources
const WATER_SOURCES = [
    { value: "borewell", label: "Borewell" },
    { value: "well", label: "Well" },
    { value: "canal", label: "Canal" },
    { value: "river", label: "River" },
    { value: "rainwater", label: "Rainwater" },
    { value: "pond", label: "Pond" },
    { value: "dam", label: "Dam" },
    { value: "drip", label: "Drip" },
    { value: "sprinkler", label: "Sprinkler" },
    { value: "municipal", label: "Municipal" },
    { value: "none", label: "None" },
    { value: "other", label: "Other" },
];

// Terrain types
const TERRAIN_TYPES = [
    { value: "flat", label: "Flat" },
    { value: "hilly", label: "Hilly" },
    { value: "terraced", label: "Terraced" },
    { value: "sloped", label: "Sloped" },
    { value: "valley", label: "Valley" },
    { value: "other", label: "Other" },
];

// Farm colors for multi-farm display
const FARM_COLORS = [
    "#10B981", "#3B82F6", "#F59E0B", "#EF4444",
    "#8B5CF6", "#EC4899", "#14B8A6", "#F97316",
];

/* ── Geodesic Area Calc (client-side mirror of geoUtils.js) ── */
const EARTH_RADIUS = 6371000;
const toRad = (d) => (d * Math.PI) / 180;

function calcPolygonArea(latlngs, unit = "acres") {
    if (!latlngs || latlngs.length < 3) return 0;

    let area = 0;
    for (let i = 0; i < latlngs.length; i++) {
        const j = (i + 1) % latlngs.length;
        const lng1 = toRad(latlngs[i].lng);
        const lat1 = toRad(latlngs[i].lat);
        const lng2 = toRad(latlngs[j].lng);
        const lat2 = toRad(latlngs[j].lat);
        area += (lng2 - lng1) * (2 + Math.sin(lat1) + Math.sin(lat2));
    }

    const sqm = Math.abs(area) * EARTH_RADIUS * EARTH_RADIUS / 2;

    switch (unit) {
        case "hectares": return Math.round((sqm / 10000) * 10000) / 10000;
        case "sqft": return Math.round(sqm / 0.09290304);
        default: return Math.round((sqm / 4046.8564224) * 10000) / 10000;
    }
}

// Convert Leaflet LatLng[] → GeoJSON polygon coordinates
function toGeoJSON(latlngs) {
    const ring = latlngs.map((ll) => [ll.lng, ll.lat]);
    ring.push([latlngs[0].lng, latlngs[0].lat]); // Close polygon
    return [ring];
}

// Convert GeoJSON polygon → Leaflet LatLng[]
function fromGeoJSON(coordinates) {
    if (!coordinates?.[0]) return [];
    const ring = coordinates[0];
    return ring.slice(0, -1).map(([lng, lat]) => ({ lat, lng }));
}

/* ── Dynamic Script/CSS Loader ─────────────────────────────── */
function loadResource(url, type = "script") {
    return new Promise((resolve, reject) => {
        const tag = type === "css" ? "link" : "script";
        const existing = document.querySelector(
            type === "css" ? `link[href="${url}"]` : `script[src="${url}"]`
        );
        if (existing) { resolve(); return; }

        const el = document.createElement(tag);
        if (type === "css") {
            el.rel = "stylesheet";
            el.href = url;
        } else {
            el.src = url;
            el.async = true;
        }
        el.onload = resolve;
        el.onerror = reject;
        document.head.appendChild(el);
    });
}

/* ================================================================
   MAIN COMPONENT
   ================================================================ */
export default function FarmMap({ token, apiBase = "/api" }) {
    /* ── State ──────────────────────────────────────────────── */
    const [mapReady, setMapReady] = useState(false);
    const [farms, setFarms] = useState([]);
    const [selectedFarm, setSelectedFarm] = useState(null);
    const [drawingMode, setDrawingMode] = useState(false);
    const [drawingPoints, setDrawingPoints] = useState([]);
    const [calculatedArea, setCalculatedArea] = useState(null);
    const [areaUnit, setAreaUnit] = useState("acres");
    const [panelView, setPanelView] = useState("list"); // list | form | detail
    const [editingFarm, setEditingFarm] = useState(null);
    const [loading, setLoading] = useState(false);
    const [error, setError] = useState(null);
    const [tileLayer, setTileLayer] = useState("street"); // street | satellite
    const [geoAnalysis, setGeoAnalysis] = useState(null);

    // Form state
    const [formData, setFormData] = useState({
        name: "",
        description: "",
        soilType: "other",
        soilPH: "",
        terrain: "flat",
        waterPrimary: "other",
        waterSecondary: "",
        irrigationType: "other",
        availability: "year-round",
        farmType: "crop",
        ownershipType: "owned",
        village: "",
        district: "",
        state: "",
        pinCode: "",
    });

    /* ── Refs ───────────────────────────────────────────────── */
    const mapContainerRef = useRef(null);
    const mapRef = useRef(null);
    const tileRef = useRef(null);
    const polygonLayersRef = useRef({});
    const drawingLayerRef = useRef(null);
    const markersRef = useRef([]);

    /* ── API helpers ────────────────────────────────────────── */
    const headers = useCallback(() => ({
        "Content-Type": "application/json",
        ...(token ? { Authorization: `Bearer ${token}` } : {}),
    }), [token]);

    const showError = (msg) => {
        setError(msg);
        setTimeout(() => setError(null), 4000);
    };



    /* ── Initialize Map ─────────────────────────────────────── */
    useEffect(() => {
        if (!mapReady || !mapContainerRef.current || mapRef.current) return;

        const L = window.L;
        const map = L.map(mapContainerRef.current, {
            center: DEFAULT_CENTER,
            zoom: DEFAULT_ZOOM,
            zoomControl: false,
            attributionControl: true,
        });

        // Zoom control — bottom-right for mobile ergonomics
        L.control.zoom({ position: "bottomright" }).addTo(map);

        // Initial tile layer
        tileRef.current = L.tileLayer(TILE_URL, {
            attribution: TILE_ATTR,
            maxZoom: 19,
        }).addTo(map);

        mapRef.current = map;

        // Geolocation button
        const geoBtn = L.control({ position: "bottomright" });
        geoBtn.onAdd = () => {
            const div = L.DomUtil.create("div", "leaflet-bar geo-locate-btn");
            div.innerHTML = "📍";
            div.title = "My Location";
            div.style.cssText = "width:34px;height:34px;display:flex;align-items:center;justify-content:center;cursor:pointer;font-size:18px;background:#fff;border-radius:4px;";
            div.onclick = (e) => {
                e.stopPropagation();
                if (navigator.geolocation) {
                    navigator.geolocation.getCurrentPosition(
                        (pos) => map.flyTo([pos.coords.latitude, pos.coords.longitude], FARM_ZOOM),
                        () => showError("Location access denied"),
                        { enableHighAccuracy: true }
                    );
                }
            };
            return div;
        };
        geoBtn.addTo(map);

        return () => {
            map.remove();
            mapRef.current = null;
        };
    }, [mapReady]);

    /* ── Toggle tile layers ─────────────────────────────────── */
    useEffect(() => {
        if (!mapRef.current || !tileRef.current) return;
        mapRef.current.removeLayer(tileRef.current);

        if (tileLayer === "satellite") {
            tileRef.current = L.tileLayer(SAT_TILE_URL, { attribution: SAT_TILE_ATTR, maxZoom: 19 });
        } else {
            tileRef.current = L.tileLayer(TILE_URL, { attribution: TILE_ATTR, maxZoom: 19 });
        }
        tileRef.current.addTo(mapRef.current);
    }, [tileLayer]);

    /* ── Fetch farms ────────────────────────────────────────── */
    const fetchFarms = useCallback(async () => {
        try {
            setLoading(true);
            const res = await fetch(`${apiBase}/farms?limit=50`, { headers: headers() });
            const data = await res.json();
            if (data.success) {
                setFarms(data.data?.farms || []);
            } else {
                showError(data.message || "Failed to fetch farms");
            }
        } catch {
            showError("Network error loading farms");
        } finally {
            setLoading(false);
        }
    }, [apiBase, headers]);

    useEffect(() => {
        if (token) fetchFarms();
    }, [token, fetchFarms]);

    /* ── Render farm polygons on map ─────────────────────────── */
    useEffect(() => {
        if (!mapRef.current) return;

        // Clear existing polygons and markers
        Object.values(polygonLayersRef.current).forEach((layer) =>
            mapRef.current.removeLayer(layer)
        );
        markersRef.current.forEach((m) => mapRef.current.removeLayer(m));
        polygonLayersRef.current = {};
        markersRef.current = [];

        // Draw each farm polygon
        farms.forEach((farm, idx) => {
            if (!farm.location?.coordinates?.[0]) return;

            const latlngs = fromGeoJSON(farm.location.coordinates);
            if (latlngs.length < 3) return;

            const color = FARM_COLORS[idx % FARM_COLORS.length];
            const isSelected = selectedFarm?._id === farm._id;

            const polygon = L.polygon(latlngs, {
                color: isSelected ? "#FFD700" : color,
                fillColor: color,
                fillOpacity: isSelected ? 0.4 : 0.2,
                weight: isSelected ? 3 : 2,
                dashArray: isSelected ? "" : "5 5",
            }).addTo(mapRef.current);

            polygon.bindTooltip(
                `<strong>${farm.name}</strong><br/>${farm.area?.value?.toFixed(2) || "?"} ${farm.area?.unit || "acres"}`,
                { permanent: false, direction: "center", className: "farm-tooltip" }
            );

            polygon.on("click", () => {
                setSelectedFarm(farm);
                setPanelView("detail");
            });

            polygonLayersRef.current[farm._id] = polygon;

            // Center marker
            if (farm.center?.coordinates) {
                const [lng, lat] = farm.center.coordinates;
                const marker = L.circleMarker([lat, lng], {
                    radius: 6,
                    color: "#fff",
                    fillColor: color,
                    fillOpacity: 1,
                    weight: 2,
                }).addTo(mapRef.current);
                marker.bindTooltip(farm.name, { direction: "top", offset: [0, -10] });
                markersRef.current.push(marker);
            }
        });

        // Fit map to bounds if farms exist
        if (farms.length > 0 && !drawingMode) {
            const allCoords = farms.flatMap((f) =>
                f.location?.coordinates?.[0]?.slice(0, -1).map(([lng, lat]) => [lat, lng]) || []
            );
            if (allCoords.length > 0) {
                mapRef.current.fitBounds(allCoords, { padding: [50, 50], maxZoom: FARM_ZOOM });
            }
        }
    }, [farms, selectedFarm, drawingMode]);

    /* ── Drawing mode handlers ──────────────────────────────── */
    useEffect(() => {
        if (!mapRef.current) return;
        const map = mapRef.current;

        if (drawingMode) {
            map.getContainer().style.cursor = "crosshair";

            const onMapClick = (e) => {
                setDrawingPoints((prev) => {
                    const next = [...prev, { lat: e.latlng.lat, lng: e.latlng.lng }];

                    // Update polygon preview
                    if (drawingLayerRef.current) {
                        map.removeLayer(drawingLayerRef.current);
                    }

                    if (next.length >= 2) {
                        drawingLayerRef.current = L.polygon(next, {
                            color: "#10B981",
                            fillColor: "#10B981",
                            fillOpacity: 0.15,
                            weight: 2,
                            dashArray: "8 4",
                        }).addTo(map);
                    }

                    // Calculate area
                    if (next.length >= 3) {
                        setCalculatedArea(calcPolygonArea(next, areaUnit));
                    }

                    return next;
                });
            };

            map.on("click", onMapClick);

            return () => {
                map.off("click", onMapClick);
                map.getContainer().style.cursor = "";
            };
        } else {
            map.getContainer().style.cursor = "";
            if (drawingLayerRef.current) {
                map.removeLayer(drawingLayerRef.current);
                drawingLayerRef.current = null;
            }
        }
    }, [drawingMode, areaUnit]);

    /* ── Area unit change ───────────────────────────────────── */
    useEffect(() => {
        if (drawingPoints.length >= 3) {
            setCalculatedArea(calcPolygonArea(drawingPoints, areaUnit));
        }
    }, [areaUnit, drawingPoints]);

    /* ── Start draw ─────────────────────────────────────────── */
    const startDrawing = () => {
        setDrawingMode(true);
        setDrawingPoints([]);
        setCalculatedArea(null);
        setPanelView("form");
        setEditingFarm(null);
        setFormData({
            name: "", description: "", soilType: "other", soilPH: "", terrain: "flat",
            waterPrimary: "other", waterSecondary: "", irrigationType: "other",
            availability: "year-round", farmType: "crop", ownershipType: "owned",
            village: "", district: "", state: "", pinCode: "",
        });
    };

    /* ── Undo last point ────────────────────────────────────── */
    const undoLastPoint = () => {
        setDrawingPoints((prev) => {
            const next = prev.slice(0, -1);
            if (drawingLayerRef.current && mapRef.current) {
                mapRef.current.removeLayer(drawingLayerRef.current);
                drawingLayerRef.current = null;
            }
            if (next.length >= 2) {
                drawingLayerRef.current = L.polygon(next, {
                    color: "#10B981", fillColor: "#10B981", fillOpacity: 0.15,
                    weight: 2, dashArray: "8 4",
                }).addTo(mapRef.current);
            }
            if (next.length >= 3) {
                setCalculatedArea(calcPolygonArea(next, areaUnit));
            } else {
                setCalculatedArea(null);
            }
            return next;
        });
    };

    /* ── Cancel drawing ─────────────────────────────────────── */
    const cancelDrawing = () => {
        setDrawingMode(false);
        setDrawingPoints([]);
        setCalculatedArea(null);
        if (drawingLayerRef.current && mapRef.current) {
            mapRef.current.removeLayer(drawingLayerRef.current);
            drawingLayerRef.current = null;
        }
        setPanelView("list");
    };

    /* ── Save farm ──────────────────────────────────────────── */
    const saveFarm = async () => {
        if (drawingPoints.length < 3) {
            showError("Draw at least 3 points to form a polygon");
            return;
        }
        if (!formData.name.trim()) {
            showError("Farm name is required");
            return;
        }

        setLoading(true);
        try {
            const geoCoords = toGeoJSON(drawingPoints);

            const payload = {
                name: formData.name.trim(),
                description: formData.description.trim(),
                location: {
                    type: "Polygon",
                    coordinates: geoCoords,
                },
                area: {
                    value: calculatedArea || calcPolygonArea(drawingPoints, areaUnit),
                    unit: areaUnit,
                },
                soilType: formData.soilType,
                ...(formData.soilPH && { soilPH: parseFloat(formData.soilPH) }),
                terrain: formData.terrain,
                waterSource: {
                    primary: formData.waterPrimary,
                    ...(formData.waterSecondary && { secondary: formData.waterSecondary }),
                    irrigationType: formData.irrigationType,
                    availability: formData.availability,
                },
                farmType: formData.farmType,
                ownershipType: formData.ownershipType,
                address: {
                    village: formData.village,
                    district: formData.district,
                    state: formData.state,
                    pinCode: formData.pinCode,
                    country: "India",
                },
            };

            const url = editingFarm
                ? `${apiBase}/farms/${editingFarm._id}`
                : `${apiBase}/farms`;

            const res = await fetch(url, {
                method: editingFarm ? "PUT" : "POST",
                headers: headers(),
                body: JSON.stringify(payload),
            });

            const data = await res.json();

            if (data.success) {
                cancelDrawing();
                await fetchFarms();
            } else {
                showError(data.message || "Failed to save farm");
            }
        } catch {
            showError("Network error saving farm");
        } finally {
            setLoading(false);
        }
    };

    /* ── Delete farm ────────────────────────────────────────── */
    const deleteFarm = async (farmId) => {
        if (!confirm("Delete this farm and all associated data?")) return;

        setLoading(true);
        try {
            const res = await fetch(`${apiBase}/farms/${farmId}`, {
                method: "DELETE",
                headers: headers(),
            });
            const data = await res.json();
            if (data.success) {
                setSelectedFarm(null);
                setPanelView("list");
                await fetchFarms();
            } else {
                showError(data.message || "Failed to delete farm");
            }
        } catch {
            showError("Network error deleting farm");
        } finally {
            setLoading(false);
        }
    };

    /* ── Fly to farm ────────────────────────────────────────── */
    const flyToFarm = (farm) => {
        if (!mapRef.current || !farm.center?.coordinates) return;
        const [lng, lat] = farm.center.coordinates;
        mapRef.current.flyTo([lat, lng], FARM_ZOOM, { duration: 1.2 });
        setSelectedFarm(farm);
        setPanelView("detail");
    };

    /* ── Fetch geo analysis ─────────────────────────────────── */
    const fetchGeoAnalysis = async (farmId) => {
        try {
            const res = await fetch(`${apiBase}/farms/${farmId}/geo-analysis`, {
                headers: headers(),
            });
            const data = await res.json();
            if (data.success) {
                setGeoAnalysis(data.data);
            } else {
                showError(data.message || "Analysis failed");
            }
        } catch {
            showError("Network error");
        }
    };

    /* ── Edit existing farm ─────────────────────────────────── */
    const editFarm = (farm) => {
        setEditingFarm(farm);
        setFormData({
            name: farm.name || "",
            description: farm.description || "",
            soilType: farm.soilType || "other",
            soilPH: farm.soilPH?.toString() || "",
            terrain: farm.terrain || "flat",
            waterPrimary: farm.waterSource?.primary || "other",
            waterSecondary: farm.waterSource?.secondary || "",
            irrigationType: farm.waterSource?.irrigationType || "other",
            availability: farm.waterSource?.availability || "year-round",
            farmType: farm.farmType || "crop",
            ownershipType: farm.ownershipType || "owned",
            village: farm.address?.village || "",
            district: farm.address?.district || "",
            state: farm.address?.state || "",
            pinCode: farm.address?.pinCode || "",
        });
        setDrawingPoints(fromGeoJSON(farm.location?.coordinates));
        setDrawingMode(true);
        setCalculatedArea(farm.area?.value || null);
        setAreaUnit(farm.area?.unit || "acres");
        setPanelView("form");
    };

    /* ── Form handlers ──────────────────────────────────────── */
    const updateForm = (field, value) => {
        setFormData((prev) => ({ ...prev, [field]: value }));
    };

    /* ─────────────────────── RENDER ──────────────────────────── */
    return (
        <div className="farm-map-container">
            {/* ── Map ────────────────────────────────────── */}
            <div className="farm-map-wrapper">
                <div
                    ref={mapContainerRef}
                    className="farm-map-canvas"
                    id="farm-map"
                />

                {/* Map controls overlay */}
                <div className="map-overlay-controls">
                    {/* Tile toggle */}
                    <button
                        className="map-ctrl-btn"
                        onClick={() => setTileLayer((t) => t === "street" ? "satellite" : "street")}
                        title={tileLayer === "street" ? "Satellite View" : "Street View"}
                    >
                        {tileLayer === "street" ? "🛰️" : "🗺️"}
                    </button>

                    {/* Draw mode toggle */}
                    {!drawingMode ? (
                        <button
                            className="map-ctrl-btn map-ctrl-primary"
                            onClick={startDrawing}
                            title="Draw Farm Boundary"
                        >
                            ✏️ Draw Farm
                        </button>
                    ) : (
                        <div className="draw-controls">
                            <div className="draw-info">
                                <span className="draw-dot" />
                                Click map to place points
                            </div>
                            <div className="draw-stats">
                                <span>Points: <strong>{drawingPoints.length}</strong></span>
                                {calculatedArea !== null && (
                                    <span className="draw-area">
                                        Area: <strong>{calculatedArea.toFixed(2)}</strong>
                                        <select
                                            value={areaUnit}
                                            onChange={(e) => setAreaUnit(e.target.value)}
                                            className="unit-select"
                                        >
                                            <option value="acres">acres</option>
                                            <option value="hectares">ha</option>
                                            <option value="sqft">sq ft</option>
                                        </select>
                                    </span>
                                )}
                            </div>
                            <div className="draw-actions">
                                <button
                                    className="map-ctrl-btn"
                                    onClick={undoLastPoint}
                                    disabled={drawingPoints.length === 0}
                                >
                                    ↩ Undo
                                </button>
                                <button
                                    className="map-ctrl-btn map-ctrl-danger"
                                    onClick={cancelDrawing}
                                >
                                    ✕ Cancel
                                </button>
                            </div>
                        </div>
                    )}
                </div>

                {/* Loading overlay */}
                {!mapReady && (
                    <div className="map-loading">
                        <div className="map-spinner" />
                        <p>Loading map...</p>
                    </div>
                )}
            </div>

            {/* ── Side Panel ─────────────────────────────── */}
            <div className="farm-panel">
                {/* Panel header */}
                <div className="panel-header">
                    <h2>
                        {panelView === "list" && "🌾 My Farms"}
                        {panelView === "form" && (editingFarm ? "✏️ Edit Farm" : "🆕 New Farm")}
                        {panelView === "detail" && "📋 Farm Details"}
                    </h2>
                    {panelView !== "list" && (
                        <button
                            className="panel-back-btn"
                            onClick={() => {
                                if (drawingMode) cancelDrawing();
                                setPanelView("list");
                                setSelectedFarm(null);
                                setGeoAnalysis(null);
                            }}
                        >
                            ← Back
                        </button>
                    )}
                </div>

                <div className="panel-body">
                    {/* ── FARM LIST ────────────────────── */}
                    {panelView === "list" && (
                        <div className="farm-list">
                            {loading && <div className="panel-loading">Loading farms...</div>}

                            {!loading && farms.length === 0 && (
                                <div className="empty-state">
                                    <span className="empty-icon">🗺️</span>
                                    <p>No farms mapped yet</p>
                                    <p className="empty-sub">Click <strong>"✏️ Draw Farm"</strong> to map your first farm boundary</p>
                                </div>
                            )}

                            {farms.map((farm, idx) => (
                                <div
                                    key={farm._id}
                                    className={`farm-card ${selectedFarm?._id === farm._id ? "farm-card-selected" : ""}`}
                                    onClick={() => flyToFarm(farm)}
                                >
                                    <div
                                        className="farm-card-color"
                                        style={{ backgroundColor: FARM_COLORS[idx % FARM_COLORS.length] }}
                                    />
                                    <div className="farm-card-body">
                                        <h3>{farm.name}</h3>
                                        <div className="farm-card-meta">
                                            <span>📐 {farm.area?.value?.toFixed(2) || "?"} {farm.area?.unit || "acres"}</span>
                                            <span>🌱 {farm.soilType || "—"}</span>
                                            <span>💧 {farm.waterSource?.primary || "—"}</span>
                                        </div>
                                    </div>
                                    <span className="farm-card-arrow">›</span>
                                </div>
                            ))}

                            <div className="panel-footer-note">
                                <strong>{farms.length}</strong> farm{farms.length !== 1 ? "s" : ""} mapped
                            </div>
                        </div>
                    )}

                    {/* ── FARM FORM ────────────────────── */}
                    {panelView === "form" && (
                        <div className="farm-form">
                            {/* Farm name */}
                            <div className="form-group">
                                <label>Farm Name *</label>
                                <input
                                    type="text"
                                    value={formData.name}
                                    onChange={(e) => updateForm("name", e.target.value)}
                                    placeholder="e.g. North Field"
                                    maxLength={100}
                                />
                            </div>

                            <div className="form-group">
                                <label>Description</label>
                                <textarea
                                    value={formData.description}
                                    onChange={(e) => updateForm("description", e.target.value)}
                                    placeholder="Optional notes about this farm"
                                    rows={2}
                                />
                            </div>

                            <hr className="form-divider" />
                            <h4 className="form-section-title">🌍 Soil & Land</h4>

                            <div className="form-row">
                                <div className="form-group">
                                    <label>Soil Type</label>
                                    <select
                                        value={formData.soilType}
                                        onChange={(e) => updateForm("soilType", e.target.value)}
                                    >
                                        {SOIL_TYPES.map((s) => (
                                            <option key={s.value} value={s.value}>{s.label}</option>
                                        ))}
                                    </select>
                                </div>
                                <div className="form-group">
                                    <label>Soil pH</label>
                                    <input
                                        type="number"
                                        value={formData.soilPH}
                                        onChange={(e) => updateForm("soilPH", e.target.value)}
                                        placeholder="0–14"
                                        min={0}
                                        max={14}
                                        step={0.1}
                                    />
                                </div>
                            </div>

                            <div className="form-group">
                                <label>Terrain</label>
                                <select
                                    value={formData.terrain}
                                    onChange={(e) => updateForm("terrain", e.target.value)}
                                >
                                    {TERRAIN_TYPES.map((t) => (
                                        <option key={t.value} value={t.value}>{t.label}</option>
                                    ))}
                                </select>
                            </div>

                            <hr className="form-divider" />
                            <h4 className="form-section-title">💧 Water Source</h4>

                            <div className="form-row">
                                <div className="form-group">
                                    <label>Primary</label>
                                    <select
                                        value={formData.waterPrimary}
                                        onChange={(e) => updateForm("waterPrimary", e.target.value)}
                                    >
                                        {WATER_SOURCES.map((ws) => (
                                            <option key={ws.value} value={ws.value}>{ws.label}</option>
                                        ))}
                                    </select>
                                </div>
                                <div className="form-group">
                                    <label>Secondary</label>
                                    <select
                                        value={formData.waterSecondary}
                                        onChange={(e) => updateForm("waterSecondary", e.target.value)}
                                    >
                                        <option value="">None</option>
                                        {WATER_SOURCES.map((ws) => (
                                            <option key={ws.value} value={ws.value}>{ws.label}</option>
                                        ))}
                                    </select>
                                </div>
                            </div>

                            <div className="form-row">
                                <div className="form-group">
                                    <label>Irrigation</label>
                                    <select
                                        value={formData.irrigationType}
                                        onChange={(e) => updateForm("irrigationType", e.target.value)}
                                    >
                                        <option value="flood">Flood</option>
                                        <option value="drip">Drip</option>
                                        <option value="sprinkler">Sprinkler</option>
                                        <option value="furrow">Furrow</option>
                                        <option value="center-pivot">Center Pivot</option>
                                        <option value="manual">Manual</option>
                                        <option value="rainfed">Rainfed</option>
                                        <option value="other">Other</option>
                                    </select>
                                </div>
                                <div className="form-group">
                                    <label>Availability</label>
                                    <select
                                        value={formData.availability}
                                        onChange={(e) => updateForm("availability", e.target.value)}
                                    >
                                        <option value="year-round">Year-round</option>
                                        <option value="seasonal">Seasonal</option>
                                        <option value="limited">Limited</option>
                                        <option value="scarce">Scarce</option>
                                    </select>
                                </div>
                            </div>

                            <hr className="form-divider" />
                            <h4 className="form-section-title">📍 Address</h4>

                            <div className="form-row">
                                <div className="form-group">
                                    <label>Village</label>
                                    <input
                                        type="text"
                                        value={formData.village}
                                        onChange={(e) => updateForm("village", e.target.value)}
                                        placeholder="Village name"
                                    />
                                </div>
                                <div className="form-group">
                                    <label>District</label>
                                    <input
                                        type="text"
                                        value={formData.district}
                                        onChange={(e) => updateForm("district", e.target.value)}
                                        placeholder="District"
                                    />
                                </div>
                            </div>

                            <div className="form-row">
                                <div className="form-group">
                                    <label>State</label>
                                    <input
                                        type="text"
                                        value={formData.state}
                                        onChange={(e) => updateForm("state", e.target.value)}
                                        placeholder="State"
                                    />
                                </div>
                                <div className="form-group">
                                    <label>PIN Code</label>
                                    <input
                                        type="text"
                                        value={formData.pinCode}
                                        onChange={(e) => updateForm("pinCode", e.target.value)}
                                        placeholder="6-digit"
                                        maxLength={6}
                                    />
                                </div>
                            </div>

                            {/* Save button */}
                            <button
                                className="btn-save-farm"
                                onClick={saveFarm}
                                disabled={loading || drawingPoints.length < 3 || !formData.name.trim()}
                            >
                                {loading ? "Saving..." : editingFarm ? "💾 Update Farm" : "💾 Save Farm"}
                            </button>
                        </div>
                    )}

                    {/* ── FARM DETAIL ─────────────────── */}
                    {panelView === "detail" && selectedFarm && (
                        <div className="farm-detail">
                            <h3 className="detail-name">{selectedFarm.name}</h3>
                            {selectedFarm.description && (
                                <p className="detail-desc">{selectedFarm.description}</p>
                            )}

                            <div className="detail-grid">
                                <div className="detail-item">
                                    <span className="detail-label">📐 Area</span>
                                    <span className="detail-value">
                                        {selectedFarm.area?.value?.toFixed(2) || "?"} {selectedFarm.area?.unit || "acres"}
                                    </span>
                                </div>
                                <div className="detail-item">
                                    <span className="detail-label">🌱 Soil</span>
                                    <span className="detail-value">{selectedFarm.soilType || "—"}</span>
                                </div>
                                <div className="detail-item">
                                    <span className="detail-label">🏔️ Terrain</span>
                                    <span className="detail-value">{selectedFarm.terrain || "—"}</span>
                                </div>
                                <div className="detail-item">
                                    <span className="detail-label">💧 Water</span>
                                    <span className="detail-value">{selectedFarm.waterSource?.primary || "—"}</span>
                                </div>
                                <div className="detail-item">
                                    <span className="detail-label">🚿 Irrigation</span>
                                    <span className="detail-value">{selectedFarm.waterSource?.irrigationType || "—"}</span>
                                </div>
                                <div className="detail-item">
                                    <span className="detail-label">🏠 Type</span>
                                    <span className="detail-value">{selectedFarm.farmType || "—"}</span>
                                </div>
                            </div>

                            {/* Address */}
                            {(selectedFarm.address?.village || selectedFarm.address?.district) && (
                                <div className="detail-address">
                                    <span className="detail-label">📍 Address</span>
                                    <span>
                                        {[
                                            selectedFarm.address.village,
                                            selectedFarm.address.district,
                                            selectedFarm.address.state,
                                        ].filter(Boolean).join(", ")}
                                        {selectedFarm.address.pinCode ? ` - ${selectedFarm.address.pinCode}` : ""}
                                    </span>
                                </div>
                            )}

                            {/* Geo Analysis Section */}
                            <button
                                className="btn-analysis"
                                onClick={() => fetchGeoAnalysis(selectedFarm._id)}
                            >
                                📊 Run Geo-Analysis
                            </button>

                            {geoAnalysis && (
                                <div className="geo-analysis-card">
                                    <h4>📊 Geospatial Analysis</h4>
                                    <div className="analysis-grid">
                                        <div className="analysis-item">
                                            <span>Area</span>
                                            <strong>
                                                {geoAnalysis.area?.acres?.toFixed(2)} acres
                                                ({geoAnalysis.area?.hectares?.toFixed(2)} ha)
                                            </strong>
                                        </div>
                                        <div className="analysis-item">
                                            <span>Perimeter</span>
                                            <strong>{geoAnalysis.perimeter?.kilometers} km</strong>
                                        </div>
                                        <div className="analysis-item">
                                            <span>Boundary Points</span>
                                            <strong>{geoAnalysis.boundaryPoints}</strong>
                                        </div>
                                        <div className="analysis-item">
                                            <span>Centroid</span>
                                            <strong>
                                                {geoAnalysis.centroid?.latitude?.toFixed(5)},
                                                {geoAnalysis.centroid?.longitude?.toFixed(5)}
                                            </strong>
                                        </div>
                                    </div>

                                    {/* Area verification */}
                                    <div className={`verification-badge ${geoAnalysis.areaVerification?.isAccurate ? "verify-ok" : "verify-warn"}`}>
                                        {geoAnalysis.areaVerification?.isAccurate ? "✅" : "⚠️"}{" "}
                                        Area {geoAnalysis.areaVerification?.isAccurate ? "verified" : "mismatch"}{" "}
                                        ({geoAnalysis.areaVerification?.percentDifference} difference)
                                    </div>

                                    {/* Soil suitability */}
                                    {geoAnalysis.soilSuitability?.suitableCrops?.length > 0 && (
                                        <div className="soil-analysis">
                                            <h5>🌿 Suitable Crops ({geoAnalysis.soilSuitability.soilType})</h5>
                                            <div className="crop-tags">
                                                {geoAnalysis.soilSuitability.suitableCrops.map((c) => (
                                                    <span key={c} className="crop-tag crop-tag-good">{c}</span>
                                                ))}
                                            </div>
                                            {geoAnalysis.soilSuitability.unsuitableCrops?.length > 0 && (
                                                <>
                                                    <h5>⚠️ Unsuitable</h5>
                                                    <div className="crop-tags">
                                                        {geoAnalysis.soilSuitability.unsuitableCrops.map((c) => (
                                                            <span key={c} className="crop-tag crop-tag-bad">{c}</span>
                                                        ))}
                                                    </div>
                                                </>
                                            )}
                                            <p className="soil-note">{geoAnalysis.soilSuitability.notes}</p>
                                        </div>
                                    )}
                                </div>
                            )}

                            {/* Crop history */}
                            {selectedFarm.cropHistory?.length > 0 && (
                                <div className="crop-history">
                                    <h4>📜 Crop History</h4>
                                    <div className="history-list">
                                        {selectedFarm.cropHistory.slice(0, 5).map((entry, i) => (
                                            <div key={i} className="history-item">
                                                <span className="history-crop">{entry.cropName}</span>
                                                <span className="history-season">{entry.season} {entry.year}</span>
                                                {entry.yieldObtained?.value && (
                                                    <span className="history-yield">
                                                        {entry.yieldObtained.value} {entry.yieldObtained.unit}
                                                    </span>
                                                )}
                                            </div>
                                        ))}
                                    </div>
                                </div>
                            )}

                            {/* Action buttons */}
                            <div className="detail-actions">
                                <button
                                    className="btn-edit"
                                    onClick={() => editFarm(selectedFarm)}
                                >
                                    ✏️ Edit Boundary
                                </button>
                                <button
                                    className="btn-delete"
                                    onClick={() => deleteFarm(selectedFarm._id)}
                                >
                                    🗑️ Delete
                                </button>
                            </div>
                        </div>
                    )}
                </div>
            </div>

            {/* ── Error Toast ────────────────────────────── */}
            {error && <div className="farm-toast">{error}</div>}
        </div>
    );
}

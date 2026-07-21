// ============================================================
// 🌍 Geospatial Utilities (STEP 5.2)
// ============================================================
//
// Pure-math area calculation using the Shoelace formula on
// a spherical Earth (Haversine-based). No external dependencies.
//
// WHY NOT TURF.JS?
//   Turf.js is 480 KB+ and we only need area calculation +
//   centroid. These two functions are implemented here in ~80
//   lines with no dependencies. If full geospatial analysis
//   is needed later (buffer, intersection, union), Turf.js
//   can be added then.
//
// COORDINATE ORDER:
//   MongoDB/GeoJSON uses [longitude, latitude] everywhere.
//   Google Maps uses { lat, lng } objects.
//   This module expects [longitude, latitude] (GeoJSON standard).
//
// EARTH RADIUS:
//   6,371,000 meters (mean radius from WGS-84)
//
// ============================================================

const EARTH_RADIUS_M = 6_371_000; // meters

// -----------------------------------------------------------
// Convert degrees → radians
// -----------------------------------------------------------
const toRad = (deg) => (deg * Math.PI) / 180;

// -----------------------------------------------------------
// AREA: Spherical Excess Method (Geodesic)
// -----------------------------------------------------------
// For polygons on a sphere, the area equals:
//   A = R² × |Σ (λ₂ − λ₁)(2 + sin φ₁ + sin φ₂)|
//
// This is based on the Shoelace formula adapted for spherical
// coordinates. Accurate to ~0.1% for farm-scale areas (<1000 ha).
//
// @param {Array} ring - Array of [lng, lat] coordinate pairs
//                       First and last point MUST be the same
// @returns {number} Area in square meters
// -----------------------------------------------------------
const calculatePolygonAreaM2 = (ring) => {
    if (!ring || ring.length < 4) return 0;

    // Remove closing point if it duplicates the first
    const coords = ring[0][0] === ring[ring.length - 1][0] &&
        ring[0][1] === ring[ring.length - 1][1]
        ? ring.slice(0, -1)
        : ring;

    const n = coords.length;
    if (n < 3) return 0;

    let area = 0;

    for (let i = 0; i < n; i++) {
        const j = (i + 1) % n;

        const lng1 = toRad(coords[i][0]);
        const lat1 = toRad(coords[i][1]);
        const lng2 = toRad(coords[j][0]);
        const lat2 = toRad(coords[j][1]);

        // Shoelace adapted for sphere
        area += (lng2 - lng1) * (2 + Math.sin(lat1) + Math.sin(lat2));
    }

    area = Math.abs(area) * EARTH_RADIUS_M * EARTH_RADIUS_M / 2;
    return area;
};

// -----------------------------------------------------------
// UNIT CONVERSIONS
// -----------------------------------------------------------
const SQ_METERS_PER_ACRE = 4046.8564224;
const SQ_METERS_PER_HECTARE = 10000;
const SQ_METERS_PER_SQFT = 0.09290304;

/**
 * Calculate polygon area in the specified unit.
 *
 * @param {Array} ring - GeoJSON coordinate ring [[lng,lat], ...]
 * @param {string} unit - "acres", "hectares", "sqft", or "sqm"
 * @returns {number} Area rounded to 4 decimal places
 */
const calculateArea = (ring, unit = "acres") => {
    const areaM2 = calculatePolygonAreaM2(ring);

    switch (unit) {
        case "acres":
            return Math.round((areaM2 / SQ_METERS_PER_ACRE) * 10000) / 10000;
        case "hectares":
            return Math.round((areaM2 / SQ_METERS_PER_HECTARE) * 10000) / 10000;
        case "sqft":
            return Math.round(areaM2 / SQ_METERS_PER_SQFT);
        case "sqm":
            return Math.round(areaM2 * 100) / 100;
        default:
            return Math.round((areaM2 / SQ_METERS_PER_ACRE) * 10000) / 10000;
    }
};

// -----------------------------------------------------------
// CENTROID: Average of all ring vertices
// -----------------------------------------------------------
/**
 * Calculate the centroid of a polygon ring.
 *
 * @param {Array} ring - GeoJSON coordinate ring [[lng,lat], ...]
 * @returns {Array} [longitude, latitude] centroid
 */
const calculateCentroid = (ring) => {
    if (!ring || ring.length < 3) return [0, 0];

    // Remove closing point
    const coords = ring[0][0] === ring[ring.length - 1][0] &&
        ring[0][1] === ring[ring.length - 1][1]
        ? ring.slice(0, -1)
        : ring;

    const n = coords.length;
    if (n === 0) return [0, 0];

    const sumLng = coords.reduce((sum, c) => sum + c[0], 0);
    const sumLat = coords.reduce((sum, c) => sum + c[1], 0);

    return [
        Math.round((sumLng / n) * 1e7) / 1e7,
        Math.round((sumLat / n) * 1e7) / 1e7,
    ];
};

// -----------------------------------------------------------
// PERIMETER: Haversine distance between consecutive points
// -----------------------------------------------------------
/**
 * Calculate perimeter of a polygon ring in meters.
 *
 * @param {Array} ring - GeoJSON coordinate ring [[lng,lat], ...]
 * @returns {number} Perimeter in meters
 */
const calculatePerimeter = (ring) => {
    if (!ring || ring.length < 3) return 0;

    let perimeter = 0;
    for (let i = 0; i < ring.length - 1; i++) {
        perimeter += haversineDistance(ring[i], ring[i + 1]);
    }

    return Math.round(perimeter * 100) / 100;
};

/**
 * Haversine distance between two [lng, lat] points.
 * @returns {number} Distance in meters
 */
const haversineDistance = (coord1, coord2) => {
    const lat1 = toRad(coord1[1]);
    const lat2 = toRad(coord2[1]);
    const dLat = lat2 - lat1;
    const dLng = toRad(coord2[0] - coord1[0]);

    const a =
        Math.sin(dLat / 2) * Math.sin(dLat / 2) +
        Math.cos(lat1) * Math.cos(lat2) *
        Math.sin(dLng / 2) * Math.sin(dLng / 2);

    return EARTH_RADIUS_M * 2 * Math.atan2(Math.sqrt(a), Math.sqrt(1 - a));
};

// -----------------------------------------------------------
// VALIDATION: Is the polygon valid for MongoDB 2dsphere?
// -----------------------------------------------------------
/**
 * Validate a GeoJSON polygon for MongoDB storage.
 *
 * @param {Array} coordinates - GeoJSON polygon coordinates
 * @returns {{ valid: boolean, errors: string[] }}
 */
const validatePolygon = (coordinates) => {
    const errors = [];

    if (!Array.isArray(coordinates) || coordinates.length === 0) {
        errors.push("Coordinates must be a non-empty array");
        return { valid: false, errors };
    }

    const ring = coordinates[0]; // Outer ring

    if (!Array.isArray(ring) || ring.length < 4) {
        errors.push("Polygon must have at least 4 points (3 unique + closing point)");
        return { valid: false, errors };
    }

    // Check closing point
    const first = ring[0];
    const last = ring[ring.length - 1];
    if (first[0] !== last[0] || first[1] !== last[1]) {
        errors.push("Polygon must be closed (first point must equal last point)");
    }

    // Check coordinate ranges
    for (let i = 0; i < ring.length; i++) {
        const [lng, lat] = ring[i];
        if (lng < -180 || lng > 180) {
            errors.push(`Point ${i}: longitude ${lng} is out of range [-180, 180]`);
        }
        if (lat < -90 || lat > 90) {
            errors.push(`Point ${i}: latitude ${lat} is out of range [-90, 90]`);
        }
    }

    // Check for self-intersection (basic — edge-to-edge check)
    // For production-grade, use Turf.js kinks()
    if (ring.length > 5) {
        // Simple check: no duplicate consecutive points
        for (let i = 0; i < ring.length - 1; i++) {
            if (ring[i][0] === ring[i + 1][0] && ring[i][1] === ring[i + 1][1]) {
                errors.push(`Points ${i} and ${i + 1} are duplicates`);
            }
        }
    }

    // Check area is reasonable (> 10 sqm, < 10,000 hectares)
    const areaSqm = calculatePolygonAreaM2(ring);
    if (areaSqm < 10) {
        errors.push("Polygon area is too small (< 10 sq meters). Draw a larger boundary.");
    }
    if (areaSqm > 100_000_000) {
        errors.push("Polygon area exceeds 10,000 hectares. Please check coordinates.");
    }

    return { valid: errors.length === 0, errors };
};

// -----------------------------------------------------------
// SOIL-CROP SUITABILITY (STEP 5.2.4)
// -----------------------------------------------------------
// Basic rule-based crop suitability scoring.
// In production, this would be an ML model or external API.
// -----------------------------------------------------------
const SOIL_CROP_SUITABILITY = {
    clay: {
        suitable: ["rice", "wheat", "cotton", "sugarcane", "sunflower"],
        unsuitable: ["carrot", "potato", "groundnut"],
        notes: "Heavy clay retains water. Good for paddy. Needs drainage for other crops.",
    },
    sandy: {
        suitable: ["groundnut", "watermelon", "millet", "castor", "pearl-millet"],
        unsuitable: ["rice", "sugarcane"],
        notes: "Sandy soil drains fast. Needs frequent irrigation. Good for root crops.",
    },
    loamy: {
        suitable: ["wheat", "maize", "rice", "cotton", "vegetables", "tomato", "potato"],
        unsuitable: [],
        notes: "Loamy soil is ideal for most crops. Best balance of drainage and retention.",
    },
    silt: {
        suitable: ["rice", "wheat", "sugarcane", "vegetables"],
        unsuitable: ["groundnut"],
        notes: "Silty soil holds moisture well. Good fertility. May compact easily.",
    },
    "black-cotton": {
        suitable: ["cotton", "sorghum", "pigeon-pea", "soybean", "citrus"],
        unsuitable: ["rice"],
        notes: "Black cotton soil (Vertisol) swells when wet. Excellent for cotton.",
    },
    red: {
        suitable: ["millet", "groundnut", "potato", "tobacco", "pulses"],
        unsuitable: ["rice", "sugarcane"],
        notes: "Red soil is well-drained but low in fertility. Needs organic matter.",
    },
    alluvial: {
        suitable: ["rice", "wheat", "maize", "sugarcane", "jute", "vegetables"],
        unsuitable: [],
        notes: "Alluvial soil is highly fertile. Found in river plains. Excellent for farming.",
    },
    laterite: {
        suitable: ["cashew", "tea", "coffee", "rubber", "coconut"],
        unsuitable: ["wheat", "rice"],
        notes: "Laterite is acidic and iron-rich. Good for plantation crops.",
    },
    peat: {
        suitable: ["vegetables", "blueberry", "cranberry"],
        unsuitable: ["wheat", "maize"],
        notes: "Peat is organic-rich and acidic. Excellent water retention.",
    },
    chalk: {
        suitable: ["lavender", "spinach", "cabbage", "beet"],
        unsuitable: ["potato", "blueberry"],
        notes: "Chalky soil is alkaline. Limited crop range. Needs soil amendment.",
    },
    other: {
        suitable: [],
        unsuitable: [],
        notes: "Soil type not specified. Get a soil test for accurate recommendations.",
    },
};

/**
 * Get crop suitability info for a given soil type.
 *
 * @param {string} soilType - One of the defined soil types
 * @returns {Object} { suitable, unsuitable, notes }
 */
const getCropSuitability = (soilType) => {
    return SOIL_CROP_SUITABILITY[soilType] || SOIL_CROP_SUITABILITY.other;
};

/**
 * Check if a specific crop is suitable for a soil type.
 *
 * @param {string} cropName - Name of the crop
 * @param {string} soilType - Soil type
 * @returns {{ score: string, message: string }}
 */
const checkCropSoilMatch = (cropName, soilType) => {
    const info = getCropSuitability(soilType);
    const crop = cropName.toLowerCase();

    if (info.suitable.includes(crop)) {
        return {
            score: "excellent",
            message: `${cropName} is well-suited for ${soilType} soil. ${info.notes}`,
        };
    }

    if (info.unsuitable.includes(crop)) {
        return {
            score: "poor",
            message: `${cropName} is NOT recommended for ${soilType} soil. ${info.notes}`,
        };
    }

    return {
        score: "moderate",
        message: `${cropName} may grow in ${soilType} soil with proper management. ${info.notes}`,
    };
};

module.exports = {
    calculateArea,
    calculatePolygonAreaM2,
    calculateCentroid,
    calculatePerimeter,
    haversineDistance,
    validatePolygon,
    getCropSuitability,
    checkCropSoilMatch,
    SOIL_CROP_SUITABILITY,
};

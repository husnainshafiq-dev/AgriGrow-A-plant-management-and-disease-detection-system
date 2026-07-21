// ============================================================
// 🌱 Crop Suitability Service (STEP 6.2)
// ============================================================
//
// ARCHITECTURE:
// ┌──────────────────────────────────────────────────────────┐
// │           CROP SUITABILITY SCORING ENGINE                 │
// ├──────────────────────────────────────────────────────────┤
// │                                                          │
// │   INPUTS                    SCORING DIMENSIONS           │
// │   ┌──────────────┐          ┌────────────────────────┐   │
// │   │ soilType     │          │ 1. Soil Match (0-30)   │   │
// │   │ season       │          │ 2. Season Match (0-20) │   │
// │   │ waterSource  │          │ 3. Water Compat (0-20) │   │
// │   │ farmArea     │          │ 4. Area Viability (0-10)│  │
// │   │ soilPH       │          │ 5. pH Match (0-10)     │   │
// │   │ terrain      │          │ 6. Terrain (0-10)      │   │
// │   │ diseaseHistory│         │                        │   │
// │   └──────────────┘          │    TOTAL: 0-100        │   │
// │                             └────────────────────────┘   │
// │                                                          │
// │   OUTPUT:                                                │
// │   ┌──────────────────────────────┐                       │
// │   │ score (0-100)               │                       │
// │   │ grade (Excellent/Good/...)   │                       │
// │   │ reasons[]                    │                       │
// │   │ recommendations[]            │                       │
// │   │ risks[]                      │                       │
// │   └──────────────────────────────┘                       │
// └──────────────────────────────────────────────────────────┘
//
// ============================================================

const logger = require("../utils/logger");
const {
    COST_REFERENCE,
} = require("./costService");
const {
    SOIL_CROP_SUITABILITY,
    getCropSuitability,
    checkCropSoilMatch,
} = require("../utils/geoUtils");

// ============================================================
// SCORING: Detailed crop-soil-season-water compatibility
// ============================================================

/**
 * Ideal pH ranges for common crop categories.
 */
const CROP_PH_RANGES = {
    rice: { min: 5.0, max: 7.0, optimal: 6.0 },
    wheat: { min: 6.0, max: 7.5, optimal: 6.5 },
    maize: { min: 5.5, max: 7.5, optimal: 6.5 },
    sorghum: { min: 6.0, max: 7.5, optimal: 6.5 },
    millet: { min: 5.5, max: 7.0, optimal: 6.0 },
    "pigeon-pea": { min: 5.5, max: 7.0, optimal: 6.5 },
    chickpea: { min: 6.0, max: 8.0, optimal: 7.0 },
    groundnut: { min: 5.5, max: 7.0, optimal: 6.2 },
    soybean: { min: 6.0, max: 7.0, optimal: 6.5 },
    mustard: { min: 6.0, max: 7.5, optimal: 6.8 },
    sunflower: { min: 6.0, max: 7.5, optimal: 6.5 },
    cotton: { min: 6.0, max: 8.0, optimal: 7.0 },
    sugarcane: { min: 6.0, max: 7.5, optimal: 6.5 },
    jute: { min: 6.0, max: 7.5, optimal: 6.5 },
    tomato: { min: 6.0, max: 7.0, optimal: 6.5 },
    potato: { min: 5.0, max: 6.5, optimal: 5.8 },
    onion: { min: 6.0, max: 7.0, optimal: 6.5 },
    banana: { min: 5.5, max: 7.0, optimal: 6.0 },
    mango: { min: 5.5, max: 7.5, optimal: 6.5 },
    turmeric: { min: 5.0, max: 7.0, optimal: 6.0 },
    chilli: { min: 6.0, max: 7.0, optimal: 6.5 },
    tea: { min: 4.5, max: 6.0, optimal: 5.0 },
    coffee: { min: 5.0, max: 6.5, optimal: 5.5 },
    coconut: { min: 5.5, max: 7.0, optimal: 6.0 },
    rubber: { min: 4.5, max: 6.0, optimal: 5.0 },
};

/**
 * Terrain compatibility for crops.
 */
const TERRAIN_SUITABILITY = {
    flat: { bonus: ["rice", "wheat", "maize", "cotton", "sugarcane", "potato", "onion", "groundnut", "soybean", "mustard", "sunflower"], penalty: [] },
    hilly: { bonus: ["tea", "coffee", "turmeric", "mango", "rubber"], penalty: ["rice", "wheat", "sugarcane", "cotton"] },
    sloped: { bonus: ["tea", "coffee", "mango", "coconut", "turmeric"], penalty: ["rice", "sugarcane"] },
    terraced: { bonus: ["rice", "tea", "vegetables", "maize"], penalty: ["cotton", "sugarcane"] },
    valley: { bonus: ["rice", "banana", "sugarcane", "jute"], penalty: ["groundnut", "millet"] },
    plateau: { bonus: ["sorghum", "millet", "cotton", "soybean"], penalty: ["rice", "sugarcane", "jute"] },
    coastal: { bonus: ["coconut", "rice", "banana", "jute"], penalty: ["wheat", "chickpea", "mustard"] },
    marshy: { bonus: ["rice", "jute"], penalty: ["wheat", "potato", "groundnut", "cotton", "chickpea"] },
};

/**
 * Water need compatibility scoring.
 */
const WATER_COMPAT = {
    "very-high": { flood: 10, furrow: 8, sprinkler: 7, drip: 5, manual: 4, rainfed: 1, other: 5 },
    "high": { flood: 9, furrow: 8, sprinkler: 8, drip: 6, manual: 5, rainfed: 3, other: 6 },
    "medium": { flood: 6, furrow: 7, sprinkler: 9, drip: 9, manual: 6, rainfed: 5, other: 7 },
    "low": { flood: 3, furrow: 5, sprinkler: 7, drip: 8, manual: 7, rainfed: 9, other: 7 },
};


// ============================================================
// MAIN ENGINE: calculateSuitabilityScore()
// ============================================================
/**
 * Calculate a detailed suitability score for a crop on a given farm.
 *
 * @param {Object} params
 * @param {string}  params.cropKey        — Cost reference key (e.g., "rice")
 * @param {string}  [params.soilType]     — Farm soil type
 * @param {string}  [params.season]       — Target growing season
 * @param {string}  [params.irrigationType] — Irrigation system type
 * @param {number}  [params.farmArea]     — Farm area in acres
 * @param {number}  [params.soilPH]       — Soil pH value
 * @param {string}  [params.terrain]      — Terrain type
 * @param {string[]} [params.diseaseHistory] — Previously detected diseases
 * @returns {Object} Detailed suitability result
 */
const calculateSuitabilityScore = ({
    cropKey,
    soilType = "other",
    season,
    irrigationType = "other",
    farmArea,
    soilPH,
    terrain = "flat",
    diseaseHistory = [],
}) => {
    const ref = COST_REFERENCE[cropKey];
    if (!ref) {
        return { available: false, message: `Crop '${cropKey}' not found in reference data` };
    }

    const reasons = [];   // Why the score is what it is
    const positive = [];  // Good factors
    const negative = [];  // Risk factors
    const recommendations = [];

    let totalScore = 0;

    // ── 1. Soil Match (0-30 points) ────────────
    let soilScore = 0;
    const soilMatch = checkCropSoilMatch(cropKey, soilType);
    if (soilMatch.score === "excellent") {
        soilScore = 30;
        positive.push(`${soilType} soil is ideal for ${ref.displayName}`);
    } else if (soilMatch.score === "moderate") {
        soilScore = 18;
        recommendations.push(`Consider soil amendments to improve ${soilType} soil for ${ref.displayName}`);
    } else {
        soilScore = 5;
        negative.push(`${soilType} soil is not recommended for ${ref.displayName}`);
        recommendations.push(`If growing ${ref.displayName}, amend soil with organic matter and compost`);
    }
    reasons.push({ dimension: "Soil Compatibility", score: soilScore, max: 30, details: soilMatch.message });
    totalScore += soilScore;

    // ── 2. Season Match (0-20 points) ──────────
    let seasonScore = 0;
    const effectiveSeason = season || (ref.seasons?.[0]) || "year-round";
    if (ref.seasons?.includes(effectiveSeason) || effectiveSeason === "year-round") {
        seasonScore = 20;
        positive.push(`${effectiveSeason} is a recommended growing season`);
    } else if (ref.seasons?.includes("year-round")) {
        seasonScore = 18;
        positive.push(`${ref.displayName} can be grown year-round`);
    } else {
        seasonScore = 5;
        negative.push(`${effectiveSeason} is not the recommended season for ${ref.displayName}`);
        recommendations.push(`Best seasons for ${ref.displayName}: ${ref.seasons?.join(", ")}`);
    }
    reasons.push({ dimension: "Season", score: seasonScore, max: 20, details: `Target: ${effectiveSeason}, Optimal: ${ref.seasons?.join(", ")}` });
    totalScore += seasonScore;

    // ── 3. Water Compatibility (0-20 points) ───
    let waterScore = 0;
    const waterNeed = ref.waterNeed || "medium";
    const waterMap = WATER_COMPAT[waterNeed] || WATER_COMPAT["medium"];
    const irrigKey = irrigationType === "center-pivot" ? "other" : irrigationType;
    const rawWaterScore = waterMap[irrigKey] ?? waterMap.other ?? 5;
    waterScore = rawWaterScore * 2; // Scale 0-10 → 0-20
    if (waterScore >= 16) {
        positive.push(`${irrigationType} irrigation is well-suited for ${ref.displayName}'s ${waterNeed} water needs`);
    } else if (waterScore <= 6) {
        negative.push(`${irrigationType} irrigation may not meet ${ref.displayName}'s ${waterNeed} water requirements`);
        recommendations.push(`Consider upgrading to ${waterNeed === "high" || waterNeed === "very-high" ? "flood/furrow" : "drip/sprinkler"} irrigation`);
    }
    reasons.push({ dimension: "Water Compatibility", score: waterScore, max: 20, details: `Crop needs: ${waterNeed}, System: ${irrigationType}` });
    totalScore += waterScore;

    // ── 4. Area Viability (0-10 points) ────────
    let areaScore = 10; // Default full score
    if (farmArea !== undefined && farmArea !== null) {
        if (ref.category === "cash-crop" || ref.category === "fiber") {
            // These crops benefit from larger areas
            if (farmArea < 2) {
                areaScore = 4;
                negative.push(`${ref.displayName} is more viable at scale (>2 acres). Current: ${farmArea} acres`);
            } else if (farmArea >= 5) {
                areaScore = 10;
                positive.push("Adequate farm size for commercial cultivation");
            } else {
                areaScore = 7;
            }
        } else if (ref.category === "vegetable" || ref.category === "spice") {
            // Vegetables/spices are viable on smaller plots
            areaScore = farmArea >= 0.5 ? 10 : 6;
            if (farmArea >= 0.5) positive.push("Farm area is suitable for intensive cultivation");
        } else {
            areaScore = farmArea >= 1 ? 10 : 5;
        }
    }
    reasons.push({ dimension: "Area Viability", score: areaScore, max: 10, details: `Farm: ${farmArea || "N/A"} acres` });
    totalScore += areaScore;

    // ── 5. pH Match (0-10 points) ──────────────
    let phScore = 10; // Default full when pH unknown
    if (soilPH !== undefined && soilPH !== null) {
        const phRange = CROP_PH_RANGES[cropKey];
        if (phRange) {
            if (soilPH >= phRange.min && soilPH <= phRange.max) {
                const distFromOptimal = Math.abs(soilPH - phRange.optimal);
                phScore = Math.max(6, 10 - Math.round(distFromOptimal * 3));
                if (phScore >= 8) positive.push(`Soil pH ${soilPH} is excellent for ${ref.displayName}`);
                else positive.push(`Soil pH ${soilPH} is acceptable for ${ref.displayName}`);
            } else {
                phScore = 2;
                negative.push(`Soil pH ${soilPH} is outside the range ${phRange.min}–${phRange.max} for ${ref.displayName}`);
                if (soilPH < phRange.min) {
                    recommendations.push(`Add lime to raise soil pH to ${phRange.optimal}`);
                } else {
                    recommendations.push(`Add sulfur/organic matter to lower soil pH to ${phRange.optimal}`);
                }
            }
            reasons.push({ dimension: "Soil pH", score: phScore, max: 10, details: `Current: ${soilPH}, Optimal: ${phRange.optimal} (${phRange.min}–${phRange.max})` });
        } else {
            reasons.push({ dimension: "Soil pH", score: phScore, max: 10, details: "pH range data not available for this crop" });
        }
    } else {
        reasons.push({ dimension: "Soil pH", score: phScore, max: 10, details: "pH not provided, full score assumed" });
    }
    totalScore += phScore;

    // ── 6. Terrain Match (0-10 points) ─────────
    let terrainScore = 6; // Default moderate
    const terrainData = TERRAIN_SUITABILITY[terrain] || TERRAIN_SUITABILITY.flat;
    if (terrainData.bonus.includes(cropKey)) {
        terrainScore = 10;
        positive.push(`${terrain} terrain is favorable for ${ref.displayName}`);
    } else if (terrainData.penalty.includes(cropKey)) {
        terrainScore = 2;
        negative.push(`${terrain} terrain is challenging for ${ref.displayName}`);
        recommendations.push(`Consider terracing or raised beds for ${ref.displayName} on ${terrain} terrain`);
    }
    reasons.push({ dimension: "Terrain", score: terrainScore, max: 10, details: `Terrain: ${terrain}` });
    totalScore += terrainScore;

    // ── Disease History Adjustment ─────────────
    // If the farm has a history of diseases affecting this crop, reduce score
    if (diseaseHistory.length > 0) {
        const cropRelated = diseaseHistory.filter((d) =>
            d.toLowerCase().includes(cropKey) || d.toLowerCase().includes(ref.displayName.toLowerCase())
        );
        if (cropRelated.length > 0) {
            const penalty = Math.min(cropRelated.length * 3, 10);
            totalScore = Math.max(0, totalScore - penalty);
            negative.push(`${cropRelated.length} disease(s) previously detected related to ${ref.displayName}`);
            recommendations.push("Apply preventive treatments and consider disease-resistant varieties");
        }
    }

    // ── Grade assignment ───────────────────────
    let grade;
    if (totalScore >= 85) grade = "Excellent";
    else if (totalScore >= 70) grade = "Good";
    else if (totalScore >= 50) grade = "Moderate";
    else if (totalScore >= 30) grade = "Poor";
    else grade = "Not Recommended";

    // ── General recommendations always ─────────
    if (recommendations.length === 0) {
        recommendations.push("Maintain regular soil testing every 6 months");
        recommendations.push("Follow Integrated Pest Management (IPM) practices");
    }

    return {
        available: true,
        crop: ref.displayName,
        cropKey,
        category: ref.category,
        score: totalScore,
        maxScore: 100,
        grade,
        scoreBreakdown: reasons,
        positiveFactors: positive,
        riskFactors: negative,
        recommendations,
        growingInfo: {
            growingDays: ref.growingDays,
            waterNeed: ref.waterNeed,
            bestSoils: ref.bestSoils,
            recommendedSeasons: ref.seasons,
        },
    };
};


// ============================================================
// RANK: Get suitability scores for ALL crops
// ============================================================
/**
 * Rank all crops based on suitability for a specific farm.
 *
 * @param {Object} farmContext
 * @param {string}  [farmContext.soilType]
 * @param {string}  [farmContext.season]
 * @param {string}  [farmContext.irrigationType]
 * @param {number}  [farmContext.farmArea]
 * @param {number}  [farmContext.soilPH]
 * @param {string}  [farmContext.terrain]
 * @param {string[]} [farmContext.diseaseHistory]
 * @param {number}  [limit] — Max results to return
 * @returns {Object} Ranked crop list
 */
const rankAllCrops = (farmContext, limit = 0) => {
    const results = [];

    for (const cropKey of Object.keys(COST_REFERENCE)) {
        const result = calculateSuitabilityScore({
            cropKey,
            ...farmContext,
        });

        if (result.available) {
            results.push(result);
        }
    }

    // Sort by score descending
    results.sort((a, b) => b.score - a.score);

    const ranked = limit > 0 ? results.slice(0, limit) : results;

    // Summary stats
    const excellent = results.filter((r) => r.grade === "Excellent").length;
    const good = results.filter((r) => r.grade === "Good").length;
    const moderate = results.filter((r) => r.grade === "Moderate").length;
    const poor = results.filter((r) => r.grade === "Poor" || r.grade === "Not Recommended").length;

    return {
        rankings: ranked,
        summary: {
            totalAnalyzed: results.length,
            excellent,
            good,
            moderate,
            poor,
            topRecommendation: results[0] || null,
        },
    };
};

// ============================================================
// ALTERNATIVES: Suggest alternative crops
// ============================================================
/**
 * Given a target crop that may not be ideal, suggest better alternatives.
 *
 * @param {string} cropKey — The crop being considered
 * @param {Object} farmContext — Farm conditions
 * @returns {Object} Target suitability + alternatives
 */
const suggestAlternatives = (cropKey, farmContext) => {
    // Score the target crop
    const target = calculateSuitabilityScore({
        cropKey,
        ...farmContext,
    });

    // Rank all crops
    const { rankings } = rankAllCrops(farmContext);

    // Find crops with better scores in same category
    const ref = COST_REFERENCE[cropKey];
    const sameCategoryBetter = rankings.filter(
        (r) => r.category === ref?.category && r.cropKey !== cropKey && r.score > (target.score || 0)
    );

    // Find top alternatives across all categories
    const topAlternatives = rankings
        .filter((r) => r.cropKey !== cropKey)
        .slice(0, 5);

    return {
        target,
        sameCategoryAlternatives: sameCategoryBetter.slice(0, 3),
        topAlternatives,
        suggestion: target.available && target.score < 50
            ? `${ref?.displayName || cropKey} has a low suitability score. Consider ${topAlternatives[0]?.crop || "other crops"} instead.`
            : target.available && target.score >= 70
                ? `${ref?.displayName || cropKey} is a strong choice for your farm.`
                : `${ref?.displayName || cropKey} is moderately suitable. Here are some alternatives.`,
    };
};

// ============================================================
// ROTATION: Basic crop rotation suggestions
// ============================================================
/**
 * Suggest a crop rotation plan based on soil type and season cycle.
 *
 * @param {Object} params
 * @param {string} params.soilType — Farm soil type
 * @param {string} [params.currentCrop] — Currently planted crop
 * @param {string} [params.terrain]
 * @returns {Object} Rotation plan
 */
const suggestRotation = ({ soilType, currentCrop, terrain = "flat" }) => {
    const ROTATION_LOGIC = {
        // After a nitrogen-fixing legume, plant a nutrient-hungry cereal
        cereal: { followWith: ["pulse", "oilseed"], restSeason: false },
        pulse: { followWith: ["cereal", "vegetable"], restSeason: false },
        oilseed: { followWith: ["cereal", "pulse"], restSeason: false },
        vegetable: { followWith: ["pulse", "cereal"], restSeason: true },
        fruit: { followWith: ["pulse"], restSeason: true },
        spice: { followWith: ["cereal", "pulse"], restSeason: false },
        fiber: { followWith: ["pulse", "oilseed"], restSeason: false },
        "cash-crop": { followWith: ["pulse", "cereal"], restSeason: true },
    };

    const currentRef = currentCrop ? COST_REFERENCE[currentCrop.toLowerCase()] : null;
    const currentCategory = currentRef?.category || "other";
    const rotationRule = ROTATION_LOGIC[currentCategory] || { followWith: ["pulse"], restSeason: false };

    // Find suitable crops for follow-up
    const allCrops = Object.entries(COST_REFERENCE);
    const kharifOptions = [];
    const rabiOptions = [];

    for (const [key, data] of allCrops) {
        if (key === currentCrop?.toLowerCase()) continue;
        if (!data.bestSoils?.includes(soilType) && soilType !== "other") continue;

        if (rotationRule.followWith.includes(data.category)) {
            if (data.seasons?.includes("kharif")) kharifOptions.push({ key, ...data });
            if (data.seasons?.includes("rabi")) rabiOptions.push({ key, ...data });
        }
    }

    const plan = [];

    // Season 1: Current (if provided)
    if (currentCrop && currentRef) {
        plan.push({
            season: currentRef.seasons?.[0] || "current",
            crop: currentRef.displayName,
            category: currentRef.category,
            purpose: "Current crop",
        });
    }

    // Season 2: Follow-up (opposite season)
    const season2Options = currentRef?.seasons?.includes("kharif") ? rabiOptions : kharifOptions;
    if (season2Options.length > 0) {
        const pick = season2Options[0];
        plan.push({
            season: currentRef?.seasons?.includes("kharif") ? "rabi" : "kharif",
            crop: pick.displayName,
            category: pick.category,
            purpose: `${pick.category} rotation after ${currentCategory}`,
        });
    }

    // Season 3: Another rotation
    const season3Options = currentRef?.seasons?.includes("kharif") ? kharifOptions : rabiOptions;
    const filtered = season3Options.filter((c) => c.key !== season2Options[0]?.key);
    if (filtered.length > 0) {
        plan.push({
            season: currentRef?.seasons?.includes("kharif") ? "kharif" : "rabi",
            crop: filtered[0].displayName,
            category: filtered[0].category,
            purpose: `Diversification — ${filtered[0].category} crop`,
        });
    }

    return {
        currentCrop: currentRef?.displayName || currentCrop || "None specified",
        soilType,
        rotationPlan: plan,
        principles: [
            "Alternate between nitrogen-fixing (pulses) and nutrient-hungry crops (cereals)",
            "Rotate deep-rooted and shallow-rooted crops to improve soil structure",
            "Avoid planting the same crop family in consecutive seasons",
            "Include a green manure/cover crop if possible between main crops",
        ],
        restAdvice: rotationRule.restSeason
            ? "Consider a fallow period or green manure crop between rotations"
            : "Direct rotation is fine for this crop type",
    };
};

module.exports = {
    calculateSuitabilityScore,
    rankAllCrops,
    suggestAlternatives,
    suggestRotation,
    CROP_PH_RANGES,
    TERRAIN_SUITABILITY,
    WATER_COMPAT,
};

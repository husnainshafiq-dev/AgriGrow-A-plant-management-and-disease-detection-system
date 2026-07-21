// ============================================================
// 💰 Cost Estimation Service (STEP 6.1)
// ============================================================
//
// ARCHITECTURE:
// ┌──────────────────────────────────────────────────────────┐
// │                COST ESTIMATION ENGINE                     │
// ├──────────────────────────────────────────────────────────┤
// │                                                          │
// │   INPUTS                    PROCESSING                   │
// │   ┌──────────────┐          ┌──────────────────────┐     │
// │   │ cropName     │          │ 1. Base cost lookup  │     │
// │   │ area (acres) │──────────│ 2. Soil multiplier   │     │
// │   │ soilType     │          │ 3. Season multiplier  │     │
// │   │ season       │          │ 4. Irrigation adjust  │     │
// │   │ irrigationType│         │ 5. Risk premium       │     │
// │   │ customCosts  │          │ 6. Yield projection   │     │
// │   │ laborRate    │          │ 7. Revenue & ROI      │     │
// │   └──────────────┘          │ 8. Break-even calc    │     │
// │                             └──────────────────────┘     │
// │                                                          │
// │   OUTPUT:  CostEstimation document shape                 │
// │   ┌──────────────────────────────────┐                   │
// │   │ costBreakdown (9 categories)    │                   │
// │   │ totalCost / costPerAcre          │                   │
// │   │ expectedYield + revenue          │                   │
// │   │ expectedProfit + ROI             │                   │
// │   │ breakEvenYield                   │                   │
// │   │ riskFactors[]                    │                   │
// │   │ costReductionTips[]              │                   │
// │   └──────────────────────────────────┘                   │
// └──────────────────────────────────────────────────────────┘
//
// CURRENCY: INR (₹) — Indian Rupee
//
// DATA SOURCE: Average values from Indian agricultural datasets.
// In production, these would come from a database or external API
// that tracks regional and seasonal price fluctuations.
// ============================================================

const logger = require("../utils/logger");

// ============================================================
// REFERENCE DATA: Per-Acre Costs (INR ₹)
// ============================================================
// Each crop has base costs per acre and yield/revenue data.
// These represent AVERAGE values for Indian agriculture.
// ============================================================

const COST_REFERENCE = {
    // ── Cereals ──────────────────────────────────
    rice: {
        displayName: "Rice (Paddy)",
        category: "cereal",
        seeds: 1800, fertilizer: 3500, pesticides: 1200,
        labor: 8000, irrigation: 4000, equipment: 2500,
        transportation: 1000, storage: 800,
        marketPricePerQt: 2183, // MSP ₹/quintal (2024-25)
        expectedYieldPerAcre: 25, // quintals
        growingDays: 120,
        seasons: ["kharif"],
        bestSoils: ["alluvial", "clay", "loamy", "silt"],
        waterNeed: "high",
    },
    wheat: {
        displayName: "Wheat",
        category: "cereal",
        seeds: 2200, fertilizer: 3000, pesticides: 800,
        labor: 6000, irrigation: 3000, equipment: 2800,
        transportation: 800, storage: 600,
        marketPricePerQt: 2275,
        expectedYieldPerAcre: 20,
        growingDays: 130,
        seasons: ["rabi"],
        bestSoils: ["alluvial", "loamy", "clay", "silt"],
        waterNeed: "medium",
    },
    maize: {
        displayName: "Maize (Corn)",
        category: "cereal",
        seeds: 1500, fertilizer: 2800, pesticides: 1000,
        labor: 5500, irrigation: 2500, equipment: 2200,
        transportation: 700, storage: 500,
        marketPricePerQt: 2090,
        expectedYieldPerAcre: 30,
        growingDays: 100,
        seasons: ["kharif", "rabi"],
        bestSoils: ["alluvial", "loamy", "red"],
        waterNeed: "medium",
    },
    sorghum: {
        displayName: "Sorghum (Jowar)",
        category: "cereal",
        seeds: 600, fertilizer: 1800, pesticides: 600,
        labor: 4500, irrigation: 1500, equipment: 1800,
        transportation: 600, storage: 400,
        marketPricePerQt: 3180,
        expectedYieldPerAcre: 12,
        growingDays: 110,
        seasons: ["kharif", "rabi"],
        bestSoils: ["black-cotton", "red", "loamy"],
        waterNeed: "low",
    },
    millet: {
        displayName: "Pearl Millet (Bajra)",
        category: "cereal",
        seeds: 500, fertilizer: 1500, pesticides: 400,
        labor: 4000, irrigation: 1000, equipment: 1500,
        transportation: 500, storage: 400,
        marketPricePerQt: 2500,
        expectedYieldPerAcre: 10,
        growingDays: 85,
        seasons: ["kharif"],
        bestSoils: ["sandy", "red", "loamy"],
        waterNeed: "low",
    },

    // ── Pulses ───────────────────────────────────
    "pigeon-pea": {
        displayName: "Pigeon Pea (Tur/Arhar)",
        category: "pulse",
        seeds: 1200, fertilizer: 1500, pesticides: 1000,
        labor: 5000, irrigation: 1800, equipment: 1500,
        transportation: 600, storage: 500,
        marketPricePerQt: 7000,
        expectedYieldPerAcre: 6,
        growingDays: 150,
        seasons: ["kharif"],
        bestSoils: ["black-cotton", "red", "loamy"],
        waterNeed: "low",
    },
    chickpea: {
        displayName: "Chickpea (Chana)",
        category: "pulse",
        seeds: 2000, fertilizer: 1200, pesticides: 800,
        labor: 4500, irrigation: 1500, equipment: 1800,
        transportation: 500, storage: 400,
        marketPricePerQt: 5440,
        expectedYieldPerAcre: 8,
        growingDays: 105,
        seasons: ["rabi"],
        bestSoils: ["loamy", "black-cotton", "alluvial"],
        waterNeed: "low",
    },
    groundnut: {
        displayName: "Groundnut (Peanut)",
        category: "oilseed",
        seeds: 3500, fertilizer: 2000, pesticides: 900,
        labor: 6000, irrigation: 2000, equipment: 2000,
        transportation: 800, storage: 500,
        marketPricePerQt: 6377,
        expectedYieldPerAcre: 10,
        growingDays: 120,
        seasons: ["kharif", "rabi"],
        bestSoils: ["sandy", "red", "loamy"],
        waterNeed: "medium",
    },

    // ── Oilseeds ─────────────────────────────────
    soybean: {
        displayName: "Soybean",
        category: "oilseed",
        seeds: 2000, fertilizer: 2200, pesticides: 1200,
        labor: 5000, irrigation: 2000, equipment: 2000,
        transportation: 700, storage: 500,
        marketPricePerQt: 4600,
        expectedYieldPerAcre: 10,
        growingDays: 100,
        seasons: ["kharif"],
        bestSoils: ["black-cotton", "loamy", "alluvial"],
        waterNeed: "medium",
    },
    mustard: {
        displayName: "Mustard",
        category: "oilseed",
        seeds: 600, fertilizer: 1800, pesticides: 600,
        labor: 4000, irrigation: 1500, equipment: 1500,
        transportation: 500, storage: 400,
        marketPricePerQt: 5650,
        expectedYieldPerAcre: 7,
        growingDays: 110,
        seasons: ["rabi"],
        bestSoils: ["loamy", "alluvial", "sandy"],
        waterNeed: "low",
    },
    sunflower: {
        displayName: "Sunflower",
        category: "oilseed",
        seeds: 800, fertilizer: 2000, pesticides: 700,
        labor: 4500, irrigation: 2200, equipment: 1800,
        transportation: 600, storage: 400,
        marketPricePerQt: 6760,
        expectedYieldPerAcre: 6,
        growingDays: 95,
        seasons: ["kharif", "rabi"],
        bestSoils: ["black-cotton", "clay", "loamy"],
        waterNeed: "medium",
    },

    // ── Cash Crops ───────────────────────────────
    cotton: {
        displayName: "Cotton",
        category: "fiber",
        seeds: 2500, fertilizer: 4000, pesticides: 3000,
        labor: 10000, irrigation: 3500, equipment: 2500,
        transportation: 1200, storage: 800,
        marketPricePerQt: 6620,
        expectedYieldPerAcre: 8,
        growingDays: 170,
        seasons: ["kharif"],
        bestSoils: ["black-cotton", "alluvial", "loamy"],
        waterNeed: "medium",
    },
    sugarcane: {
        displayName: "Sugarcane",
        category: "cash-crop",
        seeds: 4000, fertilizer: 5000, pesticides: 2000,
        labor: 15000, irrigation: 6000, equipment: 3500,
        transportation: 2000, storage: 500,
        marketPricePerQt: 315,
        expectedYieldPerAcre: 350, // high yield per acre
        growingDays: 360,
        seasons: ["year-round"],
        bestSoils: ["alluvial", "loamy", "clay", "silt"],
        waterNeed: "very-high",
    },
    jute: {
        displayName: "Jute",
        category: "fiber",
        seeds: 800, fertilizer: 2000, pesticides: 600,
        labor: 7000, irrigation: 2000, equipment: 1500,
        transportation: 1000, storage: 500,
        marketPricePerQt: 5050,
        expectedYieldPerAcre: 12,
        growingDays: 120,
        seasons: ["kharif"],
        bestSoils: ["alluvial", "loamy", "silt"],
        waterNeed: "high",
    },

    // ── Vegetables ───────────────────────────────
    tomato: {
        displayName: "Tomato",
        category: "vegetable",
        seeds: 2500, fertilizer: 4000, pesticides: 3000,
        labor: 12000, irrigation: 4000, equipment: 2000,
        transportation: 2000, storage: 1500,
        marketPricePerQt: 1500,
        expectedYieldPerAcre: 100,
        growingDays: 90,
        seasons: ["kharif", "rabi", "zaid"],
        bestSoils: ["loamy", "alluvial", "red"],
        waterNeed: "medium",
    },
    potato: {
        displayName: "Potato",
        category: "vegetable",
        seeds: 8000, fertilizer: 3500, pesticides: 2500,
        labor: 10000, irrigation: 3500, equipment: 2500,
        transportation: 1500, storage: 2000,
        marketPricePerQt: 1000,
        expectedYieldPerAcre: 100,
        growingDays: 100,
        seasons: ["rabi"],
        bestSoils: ["loamy", "alluvial", "sandy"],
        waterNeed: "medium",
    },
    onion: {
        displayName: "Onion",
        category: "vegetable",
        seeds: 3000, fertilizer: 3000, pesticides: 2000,
        labor: 12000, irrigation: 3500, equipment: 2000,
        transportation: 1500, storage: 2500,
        marketPricePerQt: 1200,
        expectedYieldPerAcre: 80,
        growingDays: 110,
        seasons: ["kharif", "rabi"],
        bestSoils: ["loamy", "alluvial", "red"],
        waterNeed: "medium",
    },

    // ── Fruits ───────────────────────────────────
    banana: {
        displayName: "Banana",
        category: "fruit",
        seeds: 12000, fertilizer: 6000, pesticides: 2500,
        labor: 15000, irrigation: 5000, equipment: 3000,
        transportation: 3000, storage: 1500,
        marketPricePerQt: 800,
        expectedYieldPerAcre: 250,
        growingDays: 300,
        seasons: ["year-round"],
        bestSoils: ["loamy", "alluvial", "silt"],
        waterNeed: "high",
    },
    mango: {
        displayName: "Mango",
        category: "fruit",
        seeds: 5000, fertilizer: 4000, pesticides: 2000,
        labor: 8000, irrigation: 3000, equipment: 2000,
        transportation: 2000, storage: 1500,
        marketPricePerQt: 3000,
        expectedYieldPerAcre: 40,
        growingDays: 150,
        seasons: ["summer"],
        bestSoils: ["alluvial", "loamy", "laterite"],
        waterNeed: "medium",
    },

    // ── Spices ────────────────────────────────────
    turmeric: {
        displayName: "Turmeric",
        category: "spice",
        seeds: 6000, fertilizer: 3000, pesticides: 1200,
        labor: 10000, irrigation: 3000, equipment: 2000,
        transportation: 1000, storage: 1000,
        marketPricePerQt: 8000,
        expectedYieldPerAcre: 10,
        growingDays: 240,
        seasons: ["kharif"],
        bestSoils: ["loamy", "alluvial", "red"],
        waterNeed: "medium",
    },
    chilli: {
        displayName: "Chilli (Green/Red)",
        category: "spice",
        seeds: 2000, fertilizer: 3500, pesticides: 2500,
        labor: 12000, irrigation: 3500, equipment: 2000,
        transportation: 1500, storage: 1000,
        marketPricePerQt: 5000,
        expectedYieldPerAcre: 20,
        growingDays: 120,
        seasons: ["kharif", "rabi"],
        bestSoils: ["loamy", "alluvial", "black-cotton"],
        waterNeed: "medium",
    },

    // ── Plantation ───────────────────────────────
    tea: {
        displayName: "Tea",
        category: "cash-crop",
        seeds: 15000, fertilizer: 5000, pesticides: 3000,
        labor: 20000, irrigation: 4000, equipment: 3000,
        transportation: 2000, storage: 1000,
        marketPricePerQt: 15000,
        expectedYieldPerAcre: 8,
        growingDays: 365,
        seasons: ["year-round"],
        bestSoils: ["laterite", "loamy"],
        waterNeed: "high",
    },
    coffee: {
        displayName: "Coffee",
        category: "cash-crop",
        seeds: 12000, fertilizer: 4500, pesticides: 2500,
        labor: 18000, irrigation: 3500, equipment: 3000,
        transportation: 1500, storage: 1000,
        marketPricePerQt: 25000,
        expectedYieldPerAcre: 5,
        growingDays: 365,
        seasons: ["year-round"],
        bestSoils: ["laterite", "loamy", "red"],
        waterNeed: "medium",
    },
    coconut: {
        displayName: "Coconut",
        category: "cash-crop",
        seeds: 8000, fertilizer: 3500, pesticides: 1500,
        labor: 10000, irrigation: 3000, equipment: 2000,
        transportation: 1500, storage: 800,
        marketPricePerQt: 2500,
        expectedYieldPerAcre: 50,
        growingDays: 365,
        seasons: ["year-round"],
        bestSoils: ["laterite", "loamy", "alluvial"],
        waterNeed: "medium",
    },
    rubber: {
        displayName: "Rubber",
        category: "cash-crop",
        seeds: 10000, fertilizer: 3000, pesticides: 1500,
        labor: 12000, irrigation: 2500, equipment: 2000,
        transportation: 1500, storage: 800,
        marketPricePerQt: 14000,
        expectedYieldPerAcre: 6,
        growingDays: 365,
        seasons: ["year-round"],
        bestSoils: ["laterite", "loamy"],
        waterNeed: "high",
    },
};

// ============================================================
// ADJUSTMENT MULTIPLIERS
// ============================================================
// These modify base costs based on farm-specific conditions.
// ============================================================

/**
 * Soil type affects fertilizer, pesticide, and irrigation costs.
 * Values > 1 = higher cost, < 1 = lower cost.
 */
const SOIL_MULTIPLIERS = {
    clay: { fertilizer: 0.9, pesticides: 1.1, irrigation: 0.8, labor: 1.1 },
    sandy: { fertilizer: 1.2, pesticides: 0.9, irrigation: 1.3, labor: 0.9 },
    loamy: { fertilizer: 1.0, pesticides: 1.0, irrigation: 1.0, labor: 1.0 },
    silt: { fertilizer: 0.95, pesticides: 1.0, irrigation: 0.9, labor: 1.0 },
    peat: { fertilizer: 0.8, pesticides: 1.1, irrigation: 0.7, labor: 1.05 },
    chalk: { fertilizer: 1.15, pesticides: 1.0, irrigation: 1.1, labor: 1.0 },
    laterite: { fertilizer: 1.2, pesticides: 1.0, irrigation: 1.1, labor: 1.0 },
    "black-cotton": { fertilizer: 0.85, pesticides: 1.15, irrigation: 0.9, labor: 1.15 },
    red: { fertilizer: 1.15, pesticides: 1.0, irrigation: 1.15, labor: 1.0 },
    alluvial: { fertilizer: 0.85, pesticides: 0.95, irrigation: 0.9, labor: 0.95 },
    other: { fertilizer: 1.0, pesticides: 1.0, irrigation: 1.0, labor: 1.0 },
};

/**
 * Season affects labor availability and input costs.
 */
const SEASON_MULTIPLIERS = {
    kharif: { labor: 1.1, pesticides: 1.2, irrigation: 0.7 }, // Monsoon — less irrigation, more pest pressure
    rabi: { labor: 0.95, pesticides: 0.8, irrigation: 1.2 }, // Winter — more irrigation, less pests
    zaid: { labor: 1.05, pesticides: 1.1, irrigation: 1.4 }, // Summer — heavy irrigation
    spring: { labor: 1.0, pesticides: 0.9, irrigation: 1.1 },
    summer: { labor: 1.15, pesticides: 1.15, irrigation: 1.5 },
    autumn: { labor: 0.95, pesticides: 0.9, irrigation: 0.9 },
    winter: { labor: 0.9, pesticides: 0.7, irrigation: 1.3 },
    "year-round": { labor: 1.0, pesticides: 1.0, irrigation: 1.0 },
};

/**
 * Irrigation method affects base irrigation cost.
 */
const IRRIGATION_MULTIPLIERS = {
    flood: 1.3,   // Most water wastage
    furrow: 1.1,
    sprinkler: 0.85,
    drip: 0.65,  // Most efficient
    "center-pivot": 0.8,
    manual: 1.2,
    rainfed: 0.2,   // Minimal irrigation cost
    other: 1.0,
};

// ============================================================
// RISK PREMIUM CALCULATION
// ============================================================
// Adds a contingency buffer based on crop risk profile.
// ============================================================
const RISK_PROFILES = {
    cereal: { basePremium: 0.05, weatherSensitivity: "medium" },
    pulse: { basePremium: 0.08, weatherSensitivity: "medium" },
    vegetable: { basePremium: 0.12, weatherSensitivity: "high" },
    fruit: { basePremium: 0.10, weatherSensitivity: "high" },
    oilseed: { basePremium: 0.07, weatherSensitivity: "medium" },
    spice: { basePremium: 0.10, weatherSensitivity: "medium" },
    fiber: { basePremium: 0.08, weatherSensitivity: "medium" },
    "cash-crop": { basePremium: 0.06, weatherSensitivity: "low" },
    other: { basePremium: 0.10, weatherSensitivity: "medium" },
};


// ============================================================
// MAIN ENGINE: estimateCost()
// ============================================================
/**
 * Calculate comprehensive crop cultivation costs.
 *
 * @param {Object} params
 * @param {string}  params.cropName        — Name of the crop
 * @param {number}  params.area            — Farm area value
 * @param {string}  [params.areaUnit]      — "acres" | "hectares"
 * @param {string}  [params.soilType]      — Soil type for adjustments
 * @param {string}  [params.season]        — Growing season
 * @param {string}  [params.irrigationType] — Irrigation method
 * @param {number}  [params.laborRate]     — Custom labor rate per acre
 * @param {Object}  [params.customCosts]   — Override any base cost/acre
 * @param {number}  [params.marketPrice]   — Custom market price ₹/quintal
 * @returns {Object} Full cost estimation result
 */
const estimateCost = ({
    cropName,
    area,
    areaUnit = "acres",
    soilType = "other",
    season,
    irrigationType = "other",
    laborRate,
    customCosts = {},
    marketPrice,
}) => {
    // ── Normalize crop key ─────────────────────
    const key = cropName.toLowerCase().replace(/\s+/g, "-");
    const reference = COST_REFERENCE[key];

    if (!reference) {
        logger.warn(`No cost reference data for crop: ${cropName}`);
        return {
            available: false,
            message: `Cost data not yet available for '${cropName}'. Supported crops: ${Object.keys(COST_REFERENCE).join(", ")}`,
            supportedCrops: getSupportedCrops(),
        };
    }

    // ── Normalize area to acres ────────────────
    let areaInAcres = area;
    if (areaUnit === "hectares") areaInAcres = area * 2.47105;
    if (areaUnit === "sqft") areaInAcres = area / 43560;

    if (areaInAcres <= 0) {
        return { available: false, message: "Area must be greater than 0" };
    }

    // ── Get multipliers ────────────────────────
    const soilMult = SOIL_MULTIPLIERS[soilType] || SOIL_MULTIPLIERS.other;
    const effectiveSeason = season || (reference.seasons?.[0]) || "year-round";
    const seasonMult = SEASON_MULTIPLIERS[effectiveSeason] || SEASON_MULTIPLIERS["year-round"];
    const irrigMult = IRRIGATION_MULTIPLIERS[irrigationType] || 1.0;

    // ── Calculate per-acre costs with adjustments ──
    const perAcre = {
        seeds: customCosts.seeds ?? reference.seeds,
        fertilizer: Math.round((customCosts.fertilizer ?? reference.fertilizer) * (soilMult.fertilizer || 1)),
        pesticides: Math.round((customCosts.pesticides ?? reference.pesticides) * (soilMult.pesticides || 1) * (seasonMult.pesticides || 1)),
        labor: Math.round((laborRate ?? customCosts.labor ?? reference.labor) * (soilMult.labor || 1) * (seasonMult.labor || 1)),
        irrigation: Math.round((customCosts.irrigation ?? reference.irrigation) * irrigMult * (seasonMult.irrigation || 1)),
        equipment: customCosts.equipment ?? reference.equipment,
        transportation: customCosts.transportation ?? reference.transportation,
        storage: customCosts.storage ?? reference.storage,
        other: customCosts.other ?? 0,
    };

    // ── Total per-acre and overall ──────────────
    const totalPerAcre = Object.values(perAcre).reduce((sum, v) => sum + v, 0);

    // ── Risk premium ───────────────────────────
    const riskProfile = RISK_PROFILES[reference.category] || RISK_PROFILES.other;
    const riskPremium = Math.round(totalPerAcre * riskProfile.basePremium);
    const adjustedPerAcre = totalPerAcre + riskPremium;

    // ── Scale to total area ────────────────────
    const costBreakdown = {};
    for (const [cat, val] of Object.entries(perAcre)) {
        costBreakdown[cat] = Math.round(val * areaInAcres);
    }
    costBreakdown.riskContingency = Math.round(riskPremium * areaInAcres);

    const totalCost = Math.round(adjustedPerAcre * areaInAcres);

    // ── Yield & Revenue ────────────────────────
    const yieldPerAcre = reference.expectedYieldPerAcre;
    const expectedYield = Math.round(yieldPerAcre * areaInAcres * 100) / 100;
    const effectiveMarketPrice = marketPrice || reference.marketPricePerQt;
    const expectedRevenue = Math.round(expectedYield * effectiveMarketPrice);
    const expectedProfit = expectedRevenue - totalCost;
    const roi = totalCost > 0
        ? Math.round((expectedProfit / totalCost) * 1000) / 10
        : 0;

    // ── Break-even ─────────────────────────────
    const breakEvenYield = effectiveMarketPrice > 0
        ? Math.round((totalCost / effectiveMarketPrice) * 100) / 100
        : 0;

    // ── Soil compatibility note ────────────────
    const isSoilOptimal = reference.bestSoils?.includes(soilType);
    const soilNote = isSoilOptimal
        ? `${soilType} soil is well-suited for ${reference.displayName}.`
        : `${soilType} soil is not in the optimal list for ${reference.displayName}. Consider soil amendments.`;

    // ── Season compatibility ───────────────────
    const isSeasonOptimal = reference.seasons?.includes(effectiveSeason);
    const seasonNote = isSeasonOptimal
        ? `${effectiveSeason} is a recommended season for ${reference.displayName}.`
        : `${effectiveSeason} is not the typical season for ${reference.displayName}. Yield may be affected.`;

    // ── Risk factors ───────────────────────────
    const riskFactors = [];
    if (!isSoilOptimal) riskFactors.push(`Suboptimal soil type (${soilType}) may reduce yield by 10-20%`);
    if (!isSeasonOptimal) riskFactors.push(`Off-season planting may reduce yield by 15-30%`);
    if (reference.waterNeed === "high" && irrigationType === "rainfed") {
        riskFactors.push("High water-need crop with rainfed irrigation — drought risk is significant");
    }
    if (reference.waterNeed === "very-high" && ["rainfed", "manual"].includes(irrigationType)) {
        riskFactors.push("Very high water-need crop requires reliable irrigation system");
    }
    if (areaInAcres > 50) riskFactors.push("Large-scale cultivation increases labor management complexity");
    if (reference.category === "vegetable") riskFactors.push("Vegetable prices are highly volatile — consider contract farming");

    // ── Cost reduction tips ────────────────────
    const tips = [];
    if (irrigMult > 1.0) tips.push("Switch to drip irrigation to reduce water costs by up to 35%");
    if (!soilMult.fertilizer || soilMult.fertilizer > 1.0) tips.push("Apply organic manure to reduce chemical fertilizer dependency");
    if (perAcre.labor > 8000) tips.push("Consider mechanization to reduce labor costs");
    tips.push("Buy seeds and fertilizers in bulk during off-season for 10-15% discount");
    tips.push("Use Integrated Pest Management (IPM) to reduce pesticide costs");
    if (reference.category === "vegetable" || reference.category === "fruit") {
        tips.push("Consider direct-to-consumer sales to improve profit margins by 20-40%");
    }

    // ── Build result ───────────────────────────
    return {
        available: true,
        crop: reference.displayName,
        cropKey: key,
        category: reference.category,
        area: { value: areaInAcres, unit: "acres" },
        season: effectiveSeason,
        soilType,
        irrigationType,

        // Cost breakdown
        costPerAcre: perAcre,
        riskPremiumPerAcre: riskPremium,
        totalCostPerAcre: adjustedPerAcre,
        costBreakdown,
        totalCost,

        // Revenue projections
        expectedYield: { value: expectedYield, unit: "quintal" },
        yieldPerAcre: { value: yieldPerAcre, unit: "quintal/acre" },
        marketPrice: { value: effectiveMarketPrice, unit: "₹/quintal" },
        expectedRevenue,
        expectedProfit,
        roi: `${roi}%`,
        roiNumeric: roi,

        // Break-even
        breakEvenYield: { value: breakEvenYield, unit: "quintal" },
        breakEvenPercentOfExpected: expectedYield > 0
            ? `${Math.round((breakEvenYield / expectedYield) * 100)}%`
            : "N/A",

        // Growing info
        growingDays: reference.growingDays,
        waterNeed: reference.waterNeed,

        // Compatibility
        soilCompatibility: {
            isOptimal: isSoilOptimal,
            bestSoils: reference.bestSoils,
            note: soilNote,
        },
        seasonCompatibility: {
            isOptimal: isSeasonOptimal,
            recommendedSeasons: reference.seasons,
            note: seasonNote,
        },

        // Risk & advice
        riskFactors,
        costReductionTips: tips,
        riskProfile: {
            premium: `${(riskProfile.basePremium * 100).toFixed(0)}%`,
            weatherSensitivity: riskProfile.weatherSensitivity,
        },

        // Meta
        currency: "INR",
        disclaimer: "Estimates based on average Indian agricultural data. Actual costs vary by region, market conditions, and farming practices. Consult local agricultural offices for precise figures.",
    };
};

// ============================================================
// COMPARE: Side-by-side comparison of multiple crops
// ============================================================
/**
 * Compare cost estimations for multiple crops on the same farm.
 *
 * @param {Object} params
 * @param {string[]} params.cropNames  — Array of crop names
 * @param {number}   params.area       — Farm area
 * @param {string}   [params.soilType] — Soil type
 * @param {string}   [params.season]   — Season
 * @param {string}   [params.irrigationType]
 * @returns {Object} Comparison results sorted by ROI
 */
const compareCrops = ({ cropNames, area, areaUnit, soilType, season, irrigationType }) => {
    const results = [];

    for (const name of cropNames) {
        const est = estimateCost({
            cropName: name,
            area,
            areaUnit,
            soilType,
            season,
            irrigationType,
        });

        if (est.available) {
            results.push({
                crop: est.crop,
                cropKey: est.cropKey,
                category: est.category,
                totalCost: est.totalCost,
                totalCostPerAcre: est.totalCostPerAcre,
                expectedYield: est.expectedYield,
                expectedRevenue: est.expectedRevenue,
                expectedProfit: est.expectedProfit,
                roi: est.roiNumeric,
                breakEvenYield: est.breakEvenYield,
                soilCompatibility: est.soilCompatibility.isOptimal,
                seasonCompatibility: est.seasonCompatibility.isOptimal,
                growingDays: est.growingDays,
                waterNeed: est.waterNeed,
                riskFactors: est.riskFactors.length,
            });
        }
    }

    // Sort by ROI descending
    results.sort((a, b) => b.roi - a.roi);

    return {
        area: { value: area, unit: areaUnit || "acres" },
        soilType: soilType || "not specified",
        season: season || "not specified",
        comparisons: results,
        bestChoice: results[0] || null,
        lowestCost: results.length > 0
            ? results.reduce((min, r) => r.totalCost < min.totalCost ? r : min, results[0])
            : null,
        highestProfit: results.length > 0
            ? results.reduce((max, r) => r.expectedProfit > max.expectedProfit ? r : max, results[0])
            : null,
    };
};

// ============================================================
// UTILITY: Get supported crops list
// ============================================================
const getSupportedCrops = () => {
    return Object.entries(COST_REFERENCE).map(([key, data]) => ({
        key,
        name: data.displayName,
        category: data.category,
        seasons: data.seasons,
        bestSoils: data.bestSoils,
        waterNeed: data.waterNeed,
        growingDays: data.growingDays,
    }));
};

/**
 * Get crop categories for filtering.
 */
const getCropCategories = () => {
    const categories = new Set();
    Object.values(COST_REFERENCE).forEach((c) => categories.add(c.category));
    return [...categories].sort();
};

/**
 * Get crops suitable for a given soil type.
 */
const getCropsForSoil = (soilType) => {
    return Object.entries(COST_REFERENCE)
        .filter(([, data]) => data.bestSoils?.includes(soilType))
        .map(([key, data]) => ({
            key,
            name: data.displayName,
            category: data.category,
            seasons: data.seasons,
        }));
};

/**
 * Get crops suitable for a given season.
 */
const getCropsForSeason = (season) => {
    return Object.entries(COST_REFERENCE)
        .filter(([, data]) => data.seasons?.includes(season))
        .map(([key, data]) => ({
            key,
            name: data.displayName,
            category: data.category,
            bestSoils: data.bestSoils,
        }));
};

module.exports = {
    estimateCost,
    compareCrops,
    getSupportedCrops,
    getCropCategories,
    getCropsForSoil,
    getCropsForSeason,
    COST_REFERENCE,
    SOIL_MULTIPLIERS,
    SEASON_MULTIPLIERS,
    IRRIGATION_MULTIPLIERS,
};

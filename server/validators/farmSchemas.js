// ============================================================
// ✅ Farm Validation Schemas (Joi)
// ============================================================
// Validates farm creation and update requests.
// ============================================================

const Joi = require("joi");

// -----------------------------------------------------------
// Helper: GeoJSON Coordinate Validation
// -----------------------------------------------------------
const coordinatePair = Joi.array()
    .items(Joi.number().min(-180).max(180), Joi.number().min(-90).max(90))
    .length(2);

const polygonRing = Joi.array().items(coordinatePair).min(4); // min 4 points (3 + closing)
const polygonCoordinates = Joi.array().items(polygonRing).min(1);

// -----------------------------------------------------------
// CREATE FARM
// -----------------------------------------------------------
const createFarmSchema = Joi.object({
    name: Joi.string()
        .trim()
        .min(2)
        .max(100)
        .required()
        .messages({
            "string.min": "Farm name must be at least 2 characters",
            "string.max": "Farm name cannot exceed 100 characters",
            "any.required": "Farm name is required",
        }),

    description: Joi.string()
        .trim()
        .max(1000)
        .optional()
        .allow("")
        .messages({
            "string.max": "Description cannot exceed 1000 characters",
        }),

    location: Joi.object({
        type: Joi.string().valid("Polygon").default("Polygon"),
        coordinates: polygonCoordinates.required().messages({
            "any.required": "Farm boundary coordinates are required",
        }),
    }).required().messages({
        "any.required": "Farm location is required",
    }),

    center: Joi.object({
        type: Joi.string().valid("Point").default("Point"),
        coordinates: coordinatePair.required(),
    }).optional(),

    address: Joi.object({
        village: Joi.string().trim().max(100).optional().allow(""),
        district: Joi.string().trim().max(100).optional().allow(""),
        state: Joi.string().trim().max(100).optional().allow(""),
        country: Joi.string().trim().max(100).optional().allow("").default("India"),
        pinCode: Joi.string().trim().max(10).optional().allow(""),
    }).optional(),

    area: Joi.object({
        value: Joi.number()
            .positive()
            .required()
            .messages({
                "number.positive": "Area must be a positive number",
                "any.required": "Area value is required",
            }),
        unit: Joi.string()
            .valid("acres", "hectares", "sqft")
            .default("acres"),
    }).required().messages({
        "any.required": "Farm area is required",
    }),

    soilType: Joi.string()
        .valid("clay", "sandy", "loamy", "silt", "peat", "chalk", "laterite", "black-cotton", "red", "alluvial", "other")
        .default("other"),

    soilPH: Joi.number()
        .min(0)
        .max(14)
        .optional()
        .messages({
            "number.min": "Soil pH cannot be negative",
            "number.max": "Soil pH cannot exceed 14",
        }),

    terrain: Joi.string()
        .valid("flat", "hilly", "terraced", "sloped", "valley", "other")
        .default("flat"),

    waterSource: Joi.object({
        primary: Joi.string()
            .valid("borewell", "well", "canal", "river", "rainwater", "pond", "dam", "drip", "sprinkler", "municipal", "none", "other")
            .default("other"),
        secondary: Joi.string()
            .valid("borewell", "well", "canal", "river", "rainwater", "pond", "dam", "drip", "sprinkler", "municipal", "none", "other")
            .optional(),
        irrigationType: Joi.string()
            .valid("flood", "drip", "sprinkler", "furrow", "center-pivot", "manual", "rainfed", "other")
            .default("other"),
        availability: Joi.string()
            .valid("year-round", "seasonal", "limited", "scarce")
            .default("year-round"),
    }).optional(),

    farmType: Joi.string()
        .valid("crop", "orchard", "mixed", "dairy", "poultry", "aquaculture", "other")
        .default("crop"),

    ownershipType: Joi.string()
        .valid("owned", "leased", "shared", "government", "other")
        .default("owned"),

    cropHistory: Joi.array().items(
        Joi.object({
            cropName: Joi.string().trim().required(),
            variety: Joi.string().trim().optional().allow(""),
            season: Joi.string()
                .valid("kharif", "rabi", "zaid", "spring", "summer", "autumn", "winter", "year-round")
                .required(),
            year: Joi.number()
                .integer()
                .min(1900)
                .max(new Date().getFullYear())
                .required(),
            areaUsed: Joi.object({
                value: Joi.number().positive().optional(),
                unit: Joi.string().valid("acres", "hectares", "sqft").default("acres"),
            }).optional(),
            yieldObtained: Joi.object({
                value: Joi.number().min(0).optional(),
                unit: Joi.string().default("kg"),
            }).optional(),
            notes: Joi.string().max(500).optional().allow(""),
        })
    ).optional(),
});

// -----------------------------------------------------------
// UPDATE FARM
// -----------------------------------------------------------
const updateFarmSchema = Joi.object({
    name: Joi.string().trim().min(2).max(100).optional(),
    description: Joi.string().trim().max(1000).optional().allow(""),
    location: Joi.object({
        type: Joi.string().valid("Polygon").default("Polygon"),
        coordinates: polygonCoordinates.required(),
    }).optional(),
    center: Joi.object({
        type: Joi.string().valid("Point").default("Point"),
        coordinates: coordinatePair.required(),
    }).optional(),
    address: Joi.object({
        village: Joi.string().trim().max(100).optional().allow(""),
        district: Joi.string().trim().max(100).optional().allow(""),
        state: Joi.string().trim().max(100).optional().allow(""),
        country: Joi.string().trim().max(100).optional().allow(""),
        pinCode: Joi.string().trim().max(10).optional().allow(""),
    }).optional(),
    area: Joi.object({
        value: Joi.number().positive().required(),
        unit: Joi.string().valid("acres", "hectares", "sqft").default("acres"),
    }).optional(),
    soilType: Joi.string()
        .valid("clay", "sandy", "loamy", "silt", "peat", "chalk", "laterite", "black-cotton", "red", "alluvial", "other")
        .optional(),
    soilPH: Joi.number().min(0).max(14).optional(),
    terrain: Joi.string().valid("flat", "hilly", "terraced", "sloped", "valley", "other").optional(),
    waterSource: Joi.object({
        primary: Joi.string().valid("borewell", "well", "canal", "river", "rainwater", "pond", "dam", "drip", "sprinkler", "municipal", "none", "other").optional(),
        secondary: Joi.string().valid("borewell", "well", "canal", "river", "rainwater", "pond", "dam", "drip", "sprinkler", "municipal", "none", "other").optional(),
        irrigationType: Joi.string().valid("flood", "drip", "sprinkler", "furrow", "center-pivot", "manual", "rainfed", "other").optional(),
        availability: Joi.string().valid("year-round", "seasonal", "limited", "scarce").optional(),
    }).optional(),
    farmType: Joi.string().valid("crop", "orchard", "mixed", "dairy", "poultry", "aquaculture", "other").optional(),
    ownershipType: Joi.string().valid("owned", "leased", "shared", "government", "other").optional(),
    isActive: Joi.boolean().optional(),
}).min(1).messages({
    "object.min": "Please provide at least one field to update",
});

// -----------------------------------------------------------
// ADD CROP HISTORY ENTRY
// -----------------------------------------------------------
const addCropHistorySchema = Joi.object({
    cropName: Joi.string().trim().required().messages({
        "any.required": "Crop name is required",
    }),
    variety: Joi.string().trim().optional().allow(""),
    season: Joi.string()
        .valid("kharif", "rabi", "zaid", "spring", "summer", "autumn", "winter", "year-round")
        .required()
        .messages({
            "any.required": "Season is required",
        }),
    year: Joi.number()
        .integer()
        .min(1900)
        .max(new Date().getFullYear())
        .required()
        .messages({
            "any.required": "Year is required",
        }),
    areaUsed: Joi.object({
        value: Joi.number().positive().optional(),
        unit: Joi.string().valid("acres", "hectares", "sqft").default("acres"),
    }).optional(),
    yieldObtained: Joi.object({
        value: Joi.number().min(0).optional(),
        unit: Joi.string().default("kg"),
    }).optional(),
    notes: Joi.string().max(500).optional().allow(""),
});

module.exports = {
    createFarmSchema,
    updateFarmSchema,
    addCropHistorySchema,
};

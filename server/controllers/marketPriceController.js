const MarketPrice = require("../models/MarketPrice");
const asyncHandler = require("express-async-handler");
const { sendSuccess, sendError } = require("../utils/apiResponse");

// Helper to seed sample market price data if empty
const seedSampleDataIfEmpty = async () => {
    const count = await MarketPrice.countDocuments();
    if (count > 0) return;

    const sampleCrops = ["wheat", "cotton", "rice", "sugarcane", "maize", "potato", "onion", "tomato"];
    const provinces = ["Punjab", "Sindh", "KPK", "Balochistan"];
    const mandis = {
        Punjab: ["Multan Mandi", "Lahore Mandi", "Faisalabad Mandi"],
        Sindh: ["Karachi Mandi", "Hyderabad Mandi", "Sukkur Mandi"],
        KPK: ["Peshawar Mandi", "Mardan Mandi"],
        Balochistan: ["Quetta Mandi", "Khuzdar Mandi"]
    };

    const priceRanges = {
        wheat: { min: 3800, max: 4200, unit: "per_40kg" },
        cotton: { min: 7500, max: 8500, unit: "per_40kg" },
        rice: { min: 5000, max: 6200, unit: "per_40kg" },
        sugarcane: { min: 400, max: 480, unit: "per_40kg" },
        maize: { min: 2200, max: 2800, unit: "per_40kg" },
        potato: { min: 80, max: 120, unit: "per_kg" },
        onion: { min: 140, max: 220, unit: "per_kg" },
        tomato: { min: 100, max: 180, unit: "per_kg" }
    };

    const entries = [];
    const today = new Date();

    // Create 15 days of price history for each crop/mandi combination
    for (let dayOffset = 14; dayOffset >= 0; dayOffset--) {
        const date = new Date();
        date.setDate(today.getDate() - dayOffset);

        for (const crop of sampleCrops) {
            const range = priceRanges[crop];
            for (const province of provinces) {
                const mandiList = mandis[province];
                for (const mandi of mandiList) {
                    // Introduce minor daily variations
                    const variance = (Math.random() - 0.5) * 0.05; // Max 5% variation
                    const avgPrice = Math.round(range.min + (range.max - range.min) / 2);
                    const currentAvg = Math.round(avgPrice * (1 + variance));
                    const currentMin = Math.round(range.min * (1 + variance));
                    const currentMax = Math.round(range.max * (1 + variance));

                    entries.push({
                        cropName: crop,
                        market: mandi,
                        province,
                        price: {
                            min: currentMin,
                            max: currentMax,
                            average: currentAvg,
                            unit: range.unit
                        },
                        currency: "PKR",
                        date,
                        source: "admin",
                        isVerified: true
                    });
                }
            }
        }
    }

    await MarketPrice.insertMany(entries);
    console.log("Seeded sample market price records successfully!");
};

// @desc    Get paginated crop prices with filters
// @route   GET /api/market/prices
// @access  Public
const getPrices = asyncHandler(async (req, res) => {
    await seedSampleDataIfEmpty();

    const { crop, market, province, dateFrom, dateTo, sort, page = 1, limit = 20 } = req.query;
    const filter = { isVerified: true };

    if (crop) filter.cropName = crop.toLowerCase();
    if (market) filter.market = market;
    if (province) filter.province = province;
    
    if (dateFrom || dateTo) {
        filter.date = {};
        if (dateFrom) filter.date.$gte = new Date(dateFrom);
        if (dateTo) filter.date.$lte = new Date(dateTo);
    }

    const sortOrder = sort === "asc" ? 1 : -1;
    const skip = (page - 1) * limit;

    const prices = await MarketPrice.find(filter)
        .populate("submittedBy", "name")
        .sort({ date: sortOrder })
        .skip(skip)
        .limit(Number(limit));

    const total = await MarketPrice.countDocuments(filter);

    sendSuccess(res, 200, "Market prices retrieved successfully", {
        prices,
        total,
        page: Number(page),
        pages: Math.ceil(total / limit)
    });
});

// @desc    Get the latest verified price for each crop
// @route   GET /api/market/prices/latest
// @access  Public
const getLatestPrices = asyncHandler(async (req, res) => {
    await seedSampleDataIfEmpty();

    const pipeline = [
        { $match: { isVerified: true } },
        { $sort: { cropName: 1, market: 1, date: -1 } },
        {
            $group: {
                _id: { cropName: "$cropName", market: "$market" },
                id: { $first: "$_id" },
                cropName: { $first: "$cropName" },
                market: { $first: "$market" },
                province: { $first: "$province" },
                price: { $first: "$price" },
                currency: { $first: "$currency" },
                date: { $first: "$date" }
            }
        },
        { $sort: { date: -1 } }
    ];

    const latest = await MarketPrice.aggregate(pipeline);
    sendSuccess(res, 200, "Latest market prices retrieved", latest);
});

// @desc    Get price history for a crop (for line charts)
// @route   GET /api/market/prices/crop/:cropName
// @access  Public
const getCropPriceHistory = asyncHandler(async (req, res) => {
    await seedSampleDataIfEmpty();
    const { cropName } = req.params;
    const { province, market, days = 30 } = req.query;

    const filter = {
        cropName: cropName.toLowerCase(),
        isVerified: true,
        date: { $gte: new Date(Date.now() - days * 24 * 60 * 60 * 1000) }
    };

    if (province) filter.province = province;
    if (market) filter.market = market;

    const history = await MarketPrice.find(filter)
        .sort({ date: 1 })
        .select("date price market province");

    sendSuccess(res, 200, `Price history for ${cropName} retrieved`, history);
});

// @desc    Get price trends (increase/decrease percentages)
// @route   GET /api/market/prices/trends
// @access  Public
const getTrends = asyncHandler(async (req, res) => {
    await seedSampleDataIfEmpty();

    const today = new Date();
    const sevenDaysAgo = new Date();
    sevenDaysAgo.setDate(today.getDate() - 7);

    // Group latest prices and compare with prices from 7 days ago
    const cropGroupLatest = await MarketPrice.aggregate([
        { $match: { isVerified: true } },
        { $sort: { cropName: 1, date: -1 } },
        {
            $group: {
                _id: "$cropName",
                latestAvg: { $first: "$price.average" },
                unit: { $first: "$price.unit" },
                currency: { $first: "$currency" }
            }
        }
    ]);

    const cropGroupWeekly = await MarketPrice.aggregate([
        { $match: { isVerified: true, date: { $lte: sevenDaysAgo } } },
        { $sort: { cropName: 1, date: -1 } },
        {
            $group: {
                _id: "$cropName",
                oldAvg: { $first: "$price.average" }
            }
        }
    ]);

    const trends = cropGroupLatest.map(item => {
        const weekly = cropGroupWeekly.find(w => w._id === item._id);
        const oldPrice = weekly ? weekly.oldAvg : item.latestAvg * 0.95; // Default mock 5% lower if no history
        const changeVal = item.latestAvg - oldPrice;
        const changePct = (changeVal / oldPrice) * 100;

        return {
            cropName: item._id,
            price: item.latestAvg,
            unit: item.unit,
            currency: item.currency,
            change: Number(changeVal.toFixed(2)),
            changePct: Number(changePct.toFixed(2))
        };
    });

    sendSuccess(res, 200, "Price trends calculated", trends);
});

// @desc    Submit a crop price (user contribution)
// @route   POST /api/market/prices
// @access  Private
const submitPrice = asyncHandler(async (req, res) => {
    const { cropName, market, province, price, date } = req.body;

    if (!cropName || !market || !province || !price || !price.average) {
        return sendError(res, 400, "Please provide cropName, market, province, and price average");
    }

    const priceEntry = await MarketPrice.create({
        cropName: cropName.toLowerCase(),
        market,
        province,
        price: {
            min: price.min || price.average * 0.95,
            max: price.max || price.average * 1.05,
            average: price.average,
            unit: price.unit || "per_40kg"
        },
        currency: "PKR",
        date: date || new Date(),
        source: req.user.role === "admin" ? "admin" : "user-contributed",
        submittedBy: req.user._id,
        isVerified: req.user.role === "admin" // Auto-verified if admin
    });

    sendSuccess(
        res,
        201,
        req.user.role === "admin" 
            ? "Market price recorded successfully" 
            : "Price report submitted. It will be visible once verified.",
        priceEntry
    );
});

// @desc    Get list of unique crop names that are tracked
// @route   GET /api/market/crops
// @access  Public
const getTrackedCrops = asyncHandler(async (res, res2) => {
    // Note: express-async-handler routes might pass req, res as first two params. Let's name them correctly.
    // Express handler standard signature is (req, res)
});

// Let's define it properly
const getCropsList = asyncHandler(async (req, res) => {
    await seedSampleDataIfEmpty();
    const crops = await MarketPrice.distinct("cropName", { isVerified: true });
    sendSuccess(res, 200, "Tracked crops retrieved", crops);
});

// @desc    Get list of unique mandis/markets
// @route   GET /api/market/mandis
// @access  Public
const getMandis = asyncHandler(async (req, res) => {
    await seedSampleDataIfEmpty();
    const mandis = await MarketPrice.distinct("market", { isVerified: true });
    sendSuccess(res, 200, "Tracked markets/mandis retrieved", mandis);
});

// @desc    Verify a user-submitted price
// @route   PATCH /api/market/prices/:id/verify
// @access  Private (Admin only)
const verifyPrice = asyncHandler(async (req, res) => {
    const price = await MarketPrice.findByIdAndUpdate(
        req.params.id,
        { isVerified: true, verifiedBy: req.user._id },
        { new: true }
    );

    if (!price) {
        return sendError(res, 404, "Market price record not found");
    }

    sendSuccess(res, 200, "Market price verified successfully", price);
});

module.exports = {
    getPrices,
    getLatestPrices,
    getCropPriceHistory,
    getTrends,
    submitPrice,
    getTrackedCrops: getCropsList, // mapping to our fixed function
    getMandis,
    verifyPrice
};

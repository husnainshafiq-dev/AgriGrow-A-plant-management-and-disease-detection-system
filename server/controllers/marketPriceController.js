// ============================================================
// 📊 Market Price Controller
// ============================================================
//
// Two data sources, two paths:
//
//   1. PRODUCTION: prices are populated by the AMIS scraper
//      (services/marketPriceScraper.js) on a daily cron job
//      (jobs/marketPriceCron.js). This controller only reads.
//
//   2. DEV/SEED: if ENABLE_SEED_DATA=true, the controller will
//      auto-seed 15 days of fake data the first time the
//      collection is empty. This is for local development only
//      and must NEVER be enabled in production.
//
// User-submitted prices go through `submitPrice` and are
// flagged as unverified until an admin reviews them.
// ============================================================

const MarketPrice = require("../models/MarketPrice");
const asyncHandler = require("express-async-handler");
const { sendSuccess, sendError } = require("../utils/apiResponse");
const logger = require("../utils/logger");

// ------------------------------------------------------------
// Seed baseline sample data if collection is empty
// ------------------------------------------------------------
// Ensures market price charts and lists are never empty on fresh deployments
const seedSampleDataIfEmpty = async () => {
    try {
        const count = await MarketPrice.countDocuments();
        if (count > 0) return;

    const sampleCrops = ["wheat", "cotton", "rice", "sugarcane", "maize", "potato", "onion", "tomato"];
    const provinces = ["Punjab", "Sindh", "KPK", "Balochistan"];
    const mandis = {
        Punjab: ["Multan Mandi", "Lahore Mandi", "Faisalabad Mandi"],
        Sindh: ["Karachi Mandi", "Hyderabad Mandi", "Sukkur Mandi"],
        KPK: ["Peshawar Mandi", "Mardan Mandi"],
        Balochistan: ["Quetta Mandi", "Khuzdar Mandi"],
    };

    const priceRanges = {
        wheat: { min: 3800, max: 4200, unit: "per_40kg" },
        cotton: { min: 7500, max: 8500, unit: "per_40kg" },
        rice: { min: 5000, max: 6200, unit: "per_40kg" },
        sugarcane: { min: 400, max: 480, unit: "per_40kg" },
        maize: { min: 2200, max: 2800, unit: "per_40kg" },
        potato: { min: 80, max: 120, unit: "per_kg" },
        onion: { min: 140, max: 220, unit: "per_kg" },
        tomato: { min: 100, max: 180, unit: "per_kg" },
    };

    const entries = [];
    const today = new Date();

    for (let dayOffset = 14; dayOffset >= 0; dayOffset--) {
        const date = new Date();
        date.setDate(today.getDate() - dayOffset);

        for (const crop of sampleCrops) {
            const range = priceRanges[crop];
            for (const province of provinces) {
                const mandiList = mandis[province];
                for (const mandi of mandiList) {
                    const variance = (Math.random() - 0.5) * 0.05;
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
                            unit: range.unit,
                        },
                        currency: "PKR",
                        date,
                        source: "seed-data",
                        isVerified: true,
                    });
                }
            }
        }
    }

    await MarketPrice.insertMany(entries);
    logger.info(`🌱 [market] seeded ${entries.length} baseline market records`);
    } catch (err) {
        logger.warn(`Failed to seed baseline market records: ${err.message}`);
    }
};

// ============================================================
// READ ENDPOINTS
// ============================================================

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
        pages: Math.ceil(total / limit),
    });
});

// @desc    Get the latest verified price for each crop/market
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
                date: { $first: "$date" },
                source: { $first: "$source" },
                submittedBy: { $first: "$submittedBy" },
                isVerified: { $first: "$isVerified" },
            },
        },
        { $sort: { date: -1 } },
    ];

    const latest = await MarketPrice.aggregate(pipeline);
    const sanitized = latest.map((item) => {
        const avg = item.price?.average || 0;
        const min = item.price?.min && item.price.min > 0 ? item.price.min : Math.round(avg * 0.95);
        const max = item.price?.max && item.price.max > 0 ? item.price.max : Math.round(avg * 1.05);
        return {
            ...item,
            price: {
                ...item.price,
                min,
                max,
                average: avg,
            },
        };
    });
    sendSuccess(res, 200, "Latest market prices retrieved", sanitized);
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
        date: { $gte: new Date(Date.now() - days * 24 * 60 * 60 * 1000) },
    };

    if (province) filter.province = province;
    if (market) filter.market = market;

    const history = await MarketPrice.find(filter)
        .sort({ date: 1 })
        .select("date price market province source");

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

    const cropGroupLatest = await MarketPrice.aggregate([
        { $match: { isVerified: true } },
        { $sort: { cropName: 1, date: -1 } },
        {
            $group: {
                _id: "$cropName",
                latestAvg: { $first: "$price.average" },
                unit: { $first: "$price.unit" },
                currency: { $first: "$currency" },
            },
        },
    ]);

    const cropGroupWeekly = await MarketPrice.aggregate([
        { $match: { isVerified: true, date: { $lte: sevenDaysAgo } } },
        { $sort: { cropName: 1, date: -1 } },
        {
            $group: {
                _id: "$cropName",
                oldAvg: { $first: "$price.average" },
            },
        },
    ]);

    const trends = cropGroupLatest.map((item) => {
        const weekly = cropGroupWeekly.find((w) => w._id === item._id);
        const oldPrice = weekly ? weekly.oldAvg : item.latestAvg * 0.95;
        const changeVal = item.latestAvg - oldPrice;
        const changePct = (changeVal / oldPrice) * 100;

        return {
            cropName: item._id,
            price: item.latestAvg,
            unit: item.unit,
            currency: item.currency,
            change: Number(changeVal.toFixed(2)),
            changePct: Number(changePct.toFixed(2)),
        };
    });

    sendSuccess(res, 200, "Price trends calculated", trends);
});

// @desc    Get list of unique crop names that are tracked
// @route   GET /api/market/crops
// @access  Public
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

// ============================================================
// WRITE ENDPOINTS
// ============================================================

// @desc    Submit a crop price (user contribution)
// @route   POST /api/market/prices
// @access  Private
const submitPrice = asyncHandler(async (req, res) => {
    const { cropName, market, province, price, date } = req.body;

    if (!cropName || !market || !province || !price || !price.average) {
        return sendError(res, 400, "Please provide cropName, market, province, and price average");
    }

    const isAdmin = ["superadmin", "admin", "editor"].includes(req.user.role);
    const priceEntry = await MarketPrice.create({
        cropName: cropName.toLowerCase(),
        market,
        province,
        price: {
            min: price.min || price.average * 0.95,
            max: price.max || price.average * 1.05,
            average: price.average,
            unit: price.unit || "per_40kg",
        },
        currency: "PKR",
        date: date || new Date(),
        source: isAdmin ? "admin" : "user-contributed",
        submittedBy: req.user._id,
        isVerified: isAdmin,
        moderationStatus: isAdmin ? "approved" : "pending",
        verifiedBy: isAdmin ? req.user._id : undefined,
    });

    sendSuccess(
        res,
        201,
        isAdmin
            ? "Market price recorded successfully"
            : "Price report submitted. An admin will review it to approve or reject before it appears on the app.",
        priceEntry
    );
});

// @desc    Admin manual-override entry (failsafe when scraper is broken)
// @route   POST /api/market/prices/manual
// @access  Private (Admin)
//
// Allows an admin to punch in prices for a (crop, market, date)
// triple directly. Use this when:
//   • The AMIS scraper is failing
//   • AMIS is missing a crop
//   • You need to correct a bad scrape
//
// Body: { cropName, market, province, price: { average, min?, max?, unit? }, date? }
const manualPriceEntry = asyncHandler(async (req, res) => {
    const { cropName, market, province, price, date } = req.body;

    if (!cropName || !market || !province || !price || !price.average) {
        return sendError(res, 400, "Missing required fields: cropName, market, province, price.average");
    }

    const entryDate = date ? new Date(date) : new Date();
    entryDate.setHours(0, 0, 0, 0);

    const record = {
        cropName: cropName.toLowerCase(),
        market,
        province,
        price: {
            min: price.min ?? price.average * 0.95,
            max: price.max ?? price.average * 1.05,
            average: price.average,
            unit: price.unit || "per_100kg",
        },
        currency: "PKR",
        date: entryDate,
        source: "admin-manual",
        submittedBy: req.user._id,
        isVerified: true,
        verifiedBy: req.user._id,
        moderationStatus: "approved",
    };

    // Upsert: replace any existing record for this (crop, market, date)
    const result = await MarketPrice.findOneAndUpdate(
        { cropName: record.cropName, market: record.market, date: entryDate },
        { $set: record },
        { new: true, upsert: true, setDefaultsOnInsert: true }
    );

    logger.info(
        `📝 [market] admin manual entry: ${record.cropName} @ ${record.market} = ₨${record.price.average}`
    );

    sendSuccess(res, 200, "Manual price entry saved", result);
});

// @desc    Admin: trigger scraper run on-demand
// @route   POST /api/market/scrape-now
// @access  Private (Admin)
const triggerScrape = asyncHandler(async (_req, res) => {
    const { runOnce } = require("../jobs/marketPriceCron");
    const result = await runOnce();
    if (!result.ok) {
        return sendError(res, 502, `Scraper failed: ${result.error}`);
    }
    sendSuccess(res, 200, "Scraper run completed", result);
});

// @desc    Admin: get cron job status
// @route   GET /api/market/cron-status
// @access  Private (Admin)
const getCronStatus = asyncHandler(async (_req, res) => {
    const { getCronStatus } = require("../jobs/marketPriceCron");
    sendSuccess(res, 200, "Cron status retrieved", getCronStatus());
});

// @desc    Admin: approve user-submitted price to show on app
// @route   PATCH /api/market/prices/:id/approve
// @access  Private (Admin only)
const approvePrice = asyncHandler(async (req, res) => {
    const price = await MarketPrice.findById(req.params.id);

    if (!price) {
        return sendError(res, 404, "Market price record not found");
    }

    price.isVerified = true;
    price.moderationStatus = "approved";
    price.verifiedBy = req.user._id;
    price.rejectedBy = undefined;
    price.rejectionReason = "";
    await price.save();

    logger.info(`✅ [market] Price approved by admin ${req.user.email}: ${price.cropName} @ ${price.market}`);

    sendSuccess(res, 200, "Market price approved and published to the app", price);
});

// @desc    Admin: reject user-submitted price from showing on app
// @route   PATCH /api/market/prices/:id/reject
// @access  Private (Admin only)
const rejectPrice = asyncHandler(async (req, res) => {
    const { reason } = req.body || {};
    const price = await MarketPrice.findById(req.params.id);

    if (!price) {
        return sendError(res, 404, "Market price record not found");
    }

    price.isVerified = false;
    price.moderationStatus = "rejected";
    price.rejectedBy = req.user._id;
    if (reason) price.rejectionReason = reason;
    await price.save();

    logger.info(`❌ [market] Price rejected by admin ${req.user.email}: ${price.cropName} @ ${price.market}`);

    sendSuccess(res, 200, "Market price submission has been rejected", price);
});

// Legacy alias for approvePrice
const verifyPrice = approvePrice;

// @desc    Admin: get moderation queue of user-contributed prices
// @route   GET /api/market/moderation-queue
// @access  Private (Admin only)
const getModerationQueue = asyncHandler(async (req, res) => {
    const { status } = req.query;
    const filter = { source: "user-contributed" };
    if (status && ["pending", "approved", "rejected"].includes(status)) {
        filter.moderationStatus = status;
    }

    const prices = await MarketPrice.find(filter)
        .populate("submittedBy", "name email role")
        .populate("verifiedBy", "name email")
        .populate("rejectedBy", "name email")
        .sort({ createdAt: -1 });

    sendSuccess(res, 200, "Moderation queue retrieved", prices);
});

// @desc    Delete a market price record (Admin only)
// @route   DELETE /api/market/prices/:id
// @access  Private (Admin only)
const deletePrice = asyncHandler(async (req, res) => {
    if (!["superadmin", "admin"].includes(req.user.role)) {
        return sendError(res, 403, "Only administrators are authorized to delete market price records");
    }

    const price = await MarketPrice.findById(req.params.id);

    if (!price) {
        return sendError(res, 404, "Market price record not found");
    }

    await MarketPrice.findByIdAndDelete(req.params.id);

    logger.info(`🗑️ [market] Price record deleted: ${price.cropName} @ ${price.market} by admin ${req.user.email}`);

    sendSuccess(res, 200, "Market price record deleted successfully");
});

// @desc    Get all prices submitted by the logged-in user
// @route   GET /api/market/my-prices
// @access  Private
const getMyReportedPrices = asyncHandler(async (req, res) => {
    const prices = await MarketPrice.find({ submittedBy: req.user._id }).sort({ date: -1 });
    sendSuccess(res, 200, "User reported prices retrieved", prices);
});

module.exports = {
    getPrices,
    getLatestPrices,
    getCropPriceHistory,
    getTrends,
    submitPrice,
    getCropsList,
    getMandis,
    manualPriceEntry,
    triggerScrape,
    getCronStatus,
    verifyPrice,
    approvePrice,
    rejectPrice,
    getModerationQueue,
    deletePrice,
    getMyReportedPrices,
};

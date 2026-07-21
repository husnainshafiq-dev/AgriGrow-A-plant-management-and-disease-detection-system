// ============================================================
// 🕷️  AMIS.PK Market Price Scraper
// ============================================================
//
// Pulls daily wholesale commodity prices from the Agriculture
// Marketing Information Service (Punjab Government) and writes
// them to the MarketPrice collection.
//
// Source: http://www.amis.pk/daily%20market%20changes.aspx
// Coverage: Punjab province only (~60+ district markets)
// Unit:    Rs per 100 KG (the standard AMIS unit)
//
// Scraper design notes:
//   • Uses cheerio (not puppeteer) — the page is server-rendered
//     ASP.NET, no JS hydration required. ~50x less memory.
//   • Filters to our 8 canonical crops; ignores the rest.
//   • Upserts by (cropName, market, date) so re-runs are idempotent.
//   • Tags every record with source: "amis-scraper" for traceability.
//   • Logs everything to Winston so failures show up in the same
//     log stream as the rest of the server.
// ============================================================

const axios = require("axios");
const cheerio = require("cheerio");
const MarketPrice = require("../models/MarketPrice");
const logger = require("../utils/logger");

const SCRAPER_URL = "http://www.amis.pk/daily%20market%20changes.aspx";
const SCRAPER_TIMEOUT_MS = 25_000;

// ------------------------------------------------------------
// Crop name normalization
// ------------------------------------------------------------
// AMIS has many crop variants. Map them to our 8 canonical names.
// The matcher is case-insensitive and ignores parenthetical Urdu text.
const CROP_ALIASES = {
    wheat: ["Wheat"],
    cotton: ["Seed Cotton", "Phutti", "Cotton"],
    rice: [
        "Rice (IRRI)",
        "Rice Basmati Super (New)",
        "Rice Basmati Super (Old)",
        "Rice Basmati (New)",
        "Rice Basmati (Old)",
    ],
    sugarcane: ["Sugarcane", "sugarcane"],
    maize: ["Maize"],
    potato: ["Potato Store", "Potato Fresh", "Potato Sugar free", "Potato"],
    onion: ["Onion"],
    tomato: ["Tomato"],
};

// Build a quick lookup: lowercased amis name → canonical key.
// First match wins (so we list the more "retail" variant first).
const ALIAS_TO_CANONICAL = (() => {
    const map = new Map();
    for (const [canonical, aliases] of Object.entries(CROP_ALIASES)) {
        for (const alias of aliases) {
            const key = alias.toLowerCase().replace(/\s+/g, " ").trim();
            if (!map.has(key)) map.set(key, canonical);
        }
    }
    return map;
})();

// ------------------------------------------------------------
// City name → "Mandi" label
// ------------------------------------------------------------
// AMIS gives bare city names like "Lahore", "DGKHAN", "TTSingh".
// We append " Mandi" to stay consistent with the existing schema
// and normalize the casing.
function toMandiName(rawCity) {
    const cleaned = rawCity.trim();
    if (!cleaned) return null;

    // Title-case a few all-caps cities while keeping their spacing.
    // "DGKHAN" → "DG Khan", "TTSingh" → "TT Singh", "FORTABAS" → "Fortabas"
    const titled = cleaned
        .replace(/^DGKHAN$/i, "DG Khan")
        .replace(/^TTSingh$/i, "TT Singh")
        .replace(/^TAJUNG$/i, "Ta Jung") // safety
        // general title-casing for the rest
        .replace(/\w\S*/g, (w) =>
            w.length <= 3 && w === w.toUpperCase() ? w : w[0].toUpperCase() + w.slice(1).toLowerCase()
        )
        // Restore all-caps abbreviations that we just lowercased
        .replace(/\bDg\b/g, "DG")
        .replace(/\bTt\b/g, "TT")
        .replace(/\bKpk\b/g, "KPK");

    return `${titled} Mandi`;
}

// ------------------------------------------------------------
// Price parser — handles "7750", "26,000", "1,02,500" (lakh format)
// ------------------------------------------------------------
function parsePrice(raw) {
    if (raw == null) return null;
    const cleaned = String(raw).replace(/[^\d]/g, "");
    if (!cleaned) return null;
    const n = parseInt(cleaned, 10);
    return Number.isFinite(n) ? n : null;
}

// ------------------------------------------------------------
// Parse a single row from the AMIS table
// ------------------------------------------------------------
// Returns a normalized object ready for the MarketPrice model,
// or null if the row doesn't match our crop filter.
function parseRow($, $row) {
    const cells = $row.find("td");
    if (cells.length < 4) return null;

    const rawCity = $(cells[0]).text().trim();
    const rawCrop = $(cells[1]).text().trim();
    const todayPrice = parsePrice($(cells[2]).text());

    if (!rawCity || !rawCrop || todayPrice == null) return null;

    // Filter to canonical crops only.
    // AMIS labels often include parenthetical Urdu/variety info like
    // "Seed Cotton(Phutti)" or "sugarcane(گنڈ یری)". Strip everything
    // from the first "(" onward before matching against our aliases.
    const cropOnly = rawCrop.split("(")[0].trim();
    const cropKey = cropOnly.toLowerCase().replace(/\s+/g, " ").trim();
    const canonicalCrop = ALIAS_TO_CANONICAL.get(cropKey);
    if (!canonicalCrop) return null;

    const market = toMandiName(rawCity);
    if (!market) return null;

    // AMIS gives one "FQP/Average" price. We treat it as the average;
    // min/max default to 0 unless we want to compute a band. Leaving
    // them at 0 keeps the API contract honest (we don't know the band).
    return {
        cropName: canonicalCrop,
        market,
        province: "Punjab", // AMIS only covers Punjab
        price: {
            min: 0,
            max: 0,
            average: todayPrice,
            unit: "per_100kg",
        },
        currency: "PKR",
        date: startOfToday(),
        source: "amis-scraper",
        isVerified: true, // government source — auto-verified
    };
}

function startOfToday() {
    const d = new Date();
    d.setHours(0, 0, 0, 0);
    return d;
}

// ------------------------------------------------------------
// Main scrape function
// ------------------------------------------------------------
async function scrapeAmisPrices() {
    const startedAt = Date.now();
    logger.info("🕷️  [AMIS scraper] starting daily price scrape");

    let html;
    try {
        const response = await axios.get(SCRAPER_URL, {
            timeout: SCRAPER_TIMEOUT_MS,
            // AMIS serves HTTP; some Node versions warn but it works.
            headers: {
                "User-Agent":
                    "Mozilla/5.0 (AgriGrow/1.0; +https://agrigrow.pk) AppleWebKit/537.36",
                Accept: "text/html,application/xhtml+xml",
            },
            // Don't throw on 4xx; we'll check status below.
            validateStatus: (s) => s >= 200 && s < 400,
        });
        html = response.data;
    } catch (err) {
        logger.error(`❌ [AMIS scraper] fetch failed: ${err.message}`);
        throw err;
    }

    const $ = cheerio.load(html);

    // The price table is identified by the grid id on the page.
    // AMIS uses a GridView with id "ctl00_cphPage_GridView1".
    const $rows = $("table#ctl00_cphPage_GridView1 tr").slice(1); // skip header

    if ($rows.length === 0) {
        // Try a more generic fallback in case they rename the id
        const $fallback = $("table tr").filter((_, el) => {
            const firstCell = $(el).find("td").first().text().trim();
            return firstCell.length > 0 && /^[A-Za-z]/.test(firstCell);
        });
        if ($fallback.length === 0) {
            throw new Error("AMIS page returned no recognizable table rows");
        }
        logger.warn(
            `[AMIS scraper] GridView id not found — fell back to ${$fallback.length} generic rows`
        );
        return persist($fallback, $, startedAt);
    }

    return persist($rows, $, startedAt);
}

async function persist($rows, $, startedAt) {
    const records = [];
    const skipped = [];

    $rows.each((_, row) => {
        const parsed = parseRow($, $(row));
        if (parsed) records.push(parsed);
        else skipped.push($(row).find("td").eq(1).text().trim() || "unknown");
    });

    if (records.length === 0) {
        logger.warn("⚠️  [AMIS scraper] no matching crop rows found (scraped, but filtered all out)");
        return {
            ok: true,
            saved: 0,
            skippedCount: skipped.length,
            durationMs: Date.now() - startedAt,
        };
    }

    // Deduplicate in case AMIS lists the same (crop, market) twice.
    // We keep the first occurrence per (cropName, market, date).
    const deduped = new Map();
    for (const r of records) {
        const key = `${r.cropName}|${r.market}|${r.date.toISOString().slice(0, 10)}`;
        if (!deduped.has(key)) deduped.set(key, r);
    }
    const unique = Array.from(deduped.values());

    // Upsert to avoid duplicates on re-runs.
    // The compound key is (cropName, market, date).
    const ops = unique.map((r) => ({
        updateOne: {
            filter: {
                cropName: r.cropName,
                market: r.market,
                date: r.date,
            },
            update: { $set: r },
            upsert: true,
        },
    }));

    let savedCount = 0;
    try {
        // Wait for Mongoose to be connected (one-off scripts may start
        // before the connection is ready). The server runtime always
        // has the connection ready by the time this runs, but the
        // safety check costs nothing.
        const mongoose = require("mongoose");
        if (mongoose.connection.readyState !== 1) {
            logger.info("⏳ [AMIS scraper] waiting for MongoDB connection…");
            await new Promise((resolve, reject) => {
                const timeout = setTimeout(
                    () => reject(new Error("MongoDB connection timeout (10s)")),
                    10_000
                );
                mongoose.connection.once("connected", () => {
                    clearTimeout(timeout);
                    resolve();
                });
                if (mongoose.connection.readyState === 1) {
                    clearTimeout(timeout);
                    resolve();
                }
            });
        }

        // Batch in chunks of 100 to avoid overwhelming the write buffer
        // when we have lots of (crop × market) combinations.
        const BATCH_SIZE = 100;
        let upserted = 0, modified = 0, matched = 0;
        for (let i = 0; i < ops.length; i += BATCH_SIZE) {
            const batch = ops.slice(i, i + BATCH_SIZE);
            const result = await MarketPrice.bulkWrite(batch, { ordered: false });
            upserted += result.upsertedCount || 0;
            modified += result.modifiedCount || 0;
            matched += result.matchedCount || 0;
        }
        savedCount = upserted + modified + matched;
        logger.info(
            `✅ [AMIS scraper] saved ${unique.length} price records ` +
            `(upserted: ${upserted}, modified: ${modified}, matched: ${matched})`
        );
    } catch (err) {
        logger.error(`❌ [AMIS scraper] bulk write failed: ${err.message}`);
        throw err;
    }

    // Per-crop summary for log readability
    const byCrop = unique.reduce((acc, r) => {
        acc[r.cropName] = (acc[r.cropName] || 0) + 1;
        return acc;
    }, {});
    logger.info(`📊 [AMIS scraper] by crop: ${JSON.stringify(byCrop)}`);

    return {
        ok: true,
        scraped: records.length,
        unique: unique.length,
        saved: savedCount,
        skipped: skipped.length,
        byCrop,
        durationMs: Date.now() - startedAt,
    };
}

module.exports = {
    scrapeAmisPrices,
    // exported for unit testing
    _internal: { parseRow, parsePrice, toMandiName, ALIAS_TO_CANONICAL },
};

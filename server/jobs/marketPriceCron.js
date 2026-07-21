// ============================================================
// ⏰  Market Price Cron Job
// ============================================================
//
// Schedules the AMIS scraper to run once a day at 6:00 AM PKT.
// On failure, it logs a CRITICAL message so it shows up
// prominently in your log stream (Winston → whatever sink
// you wire up).
//
// To change the schedule, set MARKET_PRICE_CRON in your .env
// (default: "0 6 * * *" = 6 AM daily). Timezone is PKT.
// ============================================================

const cron = require("node-cron");
const config = require("../config/env");
const logger = require("../utils/logger");
const { scrapeAmisPrices } = require("../services/marketPriceScraper");

// Default: 6:00 AM every day. Override via MARKET_PRICE_CRON in .env.
const CRON_EXPR = process.env.MARKET_PRICE_CRON || "0 6 * * *";
const TIMEZONE = "Asia/Karachi";

let task = null;
let lastRunAt = null;
let lastResult = null;

/**
 * Run the scraper once, with logging. Safe to call manually
 * (e.g. for a "Run now" admin button or a test).
 */
async function runOnce() {
    lastRunAt = new Date();
    try {
        const result = await scrapeAmisPrices();
        lastResult = { ok: true, ...result, runAt: lastRunAt };
        return lastResult;
    } catch (err) {
        lastResult = { ok: false, error: err.message, runAt: lastRunAt };
        logger.error(
            `🚨 [market-price-cron] CRITICAL — daily scrape failed: ${err.message}`
        );
        return lastResult;
    }
}

/**
 * Start the scheduled cron. Returns the active task, or null
 * if scheduling is disabled (e.g. in CI / tests).
 */
function startMarketPriceCron() {
    if (process.env.DISABLE_MARKET_PRICE_CRON === "true") {
        logger.warn("⏸️  [market-price-cron] disabled via DISABLE_MARKET_PRICE_CRON=true");
        return null;
    }

    if (!cron.validate(CRON_EXPR)) {
        logger.error(`❌ [market-price-cron] invalid cron expression: ${CRON_EXPR}`);
        return null;
    }

    task = cron.schedule(
        CRON_EXPR,
        () => {
            logger.info(`⏰ [market-price-cron] tick at ${new Date().toISOString()} — running scrape`);
            runOnce();
        },
        { timezone: TIMEZONE, scheduled: true }
    );

    logger.info(
        `⏰ [market-price-cron] scheduled "${CRON_EXPR}" (${TIMEZONE}) — task is live`
    );

    return task;
}

function stopMarketPriceCron() {
    if (task) {
        task.stop();
        task = null;
        logger.info("⏹️  [market-price-cron] stopped");
    }
}

function getCronStatus() {
    return {
        enabled: task !== null,
        expression: CRON_EXPR,
        timezone: TIMEZONE,
        lastRunAt,
        lastResult,
    };
}

module.exports = {
    startMarketPriceCron,
    stopMarketPriceCron,
    runOnce,
    getCronStatus,
};

#!/usr/bin/env node
/**
 * Test script for Gemini API connectivity with retry & throttle support.
 * Run from project root: node server/scripts/test-gemini.js
 * Uses server/.env for GEMINI_API_KEY and GEMINI_MODEL.
 */
require("dotenv").config({ path: require("path").join(__dirname, "..", ".env") });

const axios = require("axios");

const GEMINI_API_KEY = process.env.GEMINI_API_KEY;
const GEMINI_MODEL = process.env.GEMINI_MODEL || "gemini-2.5-flash-lite";
const URL = `https://generativelanguage.googleapis.com/v1beta/models/${GEMINI_MODEL}:generateContent`;

// -----------------------------------------------------------
// Helpers
// -----------------------------------------------------------
const sleep = (ms) => new Promise((resolve) => setTimeout(resolve, ms));

const RETRY_CONFIG = {
    maxRetries: 3,
    baseDelayMs: 2000,
    maxDelayMs: 16000,
    jitterMs: 500,
};

async function callWithRetry(prompt, label = "") {
    const start = Date.now();
    for (let attempt = 0; attempt <= RETRY_CONFIG.maxRetries; attempt++) {
        try {
            if (attempt > 0) {
                console.log(`  ↻ Retry ${attempt}/${RETRY_CONFIG.maxRetries}...`);
            }

            const res = await axios.post(
                `${URL}?key=${GEMINI_API_KEY}`,
                {
                    contents: [{ parts: [{ text: prompt }] }],
                    generationConfig: { maxOutputTokens: 128 },
                },
                { timeout: 30000, headers: { "Content-Type": "application/json" } }
            );

            const text = res.data?.candidates?.[0]?.content?.parts?.[0]?.text;
            const elapsed = ((Date.now() - start) / 1000).toFixed(1);
            console.log(`  ✅ ${label} (${elapsed}s): ${(text || "(empty)").trim().substring(0, 100)}`);
            return text;
        } catch (err) {
            const status = err.response?.status;
            if ((status === 429 || status === 503) && attempt < RETRY_CONFIG.maxRetries) {
                // Use Retry-After header if available
                const retryAfter = err.response?.headers?.["retry-after"];
                let delayMs;
                if (retryAfter && !isNaN(parseInt(retryAfter))) {
                    delayMs = parseInt(retryAfter) * 1000;
                } else {
                    delayMs = RETRY_CONFIG.baseDelayMs * Math.pow(2, attempt);
                }
                const jitter = Math.floor(Math.random() * RETRY_CONFIG.jitterMs);
                delayMs = Math.min(delayMs + jitter, RETRY_CONFIG.maxDelayMs);
                console.log(`  ⚠️  ${status} received. Waiting ${delayMs}ms before retry...`);
                await sleep(delayMs);
                continue;
            }
            // Final failure
            const elapsed = ((Date.now() - start) / 1000).toFixed(1);
            console.error(`  ❌ ${label} FAILED (${elapsed}s):`);
            if (err.response) {
                console.error(`     Status: ${err.response.status}`);
                console.error(`     Body: ${JSON.stringify(err.response.data?.error?.message || err.response.data, null, 2)}`);
            } else {
                console.error(`     ${err.message}`);
            }
            return null;
        }
    }
}

// -----------------------------------------------------------
// Main
// -----------------------------------------------------------
async function main() {
    console.log("╔══════════════════════════════════════════════════╗");
    console.log("║     Gemini API Test — with Retry & Throttle     ║");
    console.log("╚══════════════════════════════════════════════════╝");
    console.log(`  Model : ${GEMINI_MODEL}`);
    console.log(`  Key   : ${GEMINI_API_KEY ? `${GEMINI_API_KEY.substring(0, 10)}...` : "(missing)"}`);
    console.log("");

    if (!GEMINI_API_KEY) {
        console.error("❌ GEMINI_API_KEY is not set in server/.env");
        process.exit(1);
    }

    // --- Test 1: Basic connectivity ---
    console.log("─── Test 1: Basic API Call ───");
    const result1 = await callWithRetry("Say hello in one word.", "Basic call");
    if (!result1) {
        console.log("\n⛔ Basic test failed. Skipping further tests.");
        process.exit(1);
    }

    // --- Test 2: Throttled sequential calls ---
    console.log("\n─── Test 2: Throttled Sequential Calls (3s gap) ───");
    const prompts = [
        "What color is the sky? Answer in one word.",
        "What color is grass? Answer in one word.",
    ];
    for (let i = 0; i < prompts.length; i++) {
        console.log(`  ⏳ Waiting 3s (throttle)...`);
        await sleep(3000);
        await callWithRetry(prompts[i], `Call ${i + 2}`);
    }

    console.log("\n══════════════════════════════════════════════════");
    console.log("  All tests complete! ✅");
    console.log("══════════════════════════════════════════════════\n");
}

main();

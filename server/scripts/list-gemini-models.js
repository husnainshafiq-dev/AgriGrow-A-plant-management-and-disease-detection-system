#!/usr/bin/env node
require("dotenv").config({ path: require("path").join(__dirname, "..", ".env") });
const axios = require("axios");

const key = process.env.GEMINI_API_KEY;
if (!key) {
    console.error("GEMINI_API_KEY not set");
    process.exit(1);
}

async function main() {
    const url = `https://generativelanguage.googleapis.com/v1beta/models?key=${key}`;
    const res = await axios.get(url);
    const models = res.data.models || [];
    console.log("Available models (generateContent):\n");
    models
        .filter((m) => m.supportedGenerationMethods?.includes("generateContent"))
        .forEach((m) => console.log("  ", m.name.replace("models/", "")));
}

main().catch((err) => {
    console.error(err.response?.data || err.message);
    process.exit(1);
});

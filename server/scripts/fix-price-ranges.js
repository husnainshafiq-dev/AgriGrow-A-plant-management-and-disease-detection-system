const mongoose = require("mongoose");
const MarketPrice = require("../models/MarketPrice");

async function fixPriceRanges() {
    await mongoose.connect("mongodb://localhost:27017/agrigrow");
    console.log("Connected to MongoDB.");

    const prices = await MarketPrice.find({
        $or: [
            { "price.min": 0 },
            { "price.min": { $exists: false } },
            { "price.max": 0 },
            { "price.max": { $exists: false } }
        ]
    });

    console.log(`Found ${prices.length} prices with zero or missing min/max.`);

    let updated = 0;
    for (const p of prices) {
        if (p.price && p.price.average) {
            p.price.min = Math.round(p.price.average * 0.95);
            p.price.max = Math.round(p.price.average * 1.05);
            await p.save();
            updated++;
        }
    }

    console.log(`Successfully updated ${updated} records with price ranges.`);

    const remainingZeros = await MarketPrice.countDocuments({ "price.min": 0 });
    console.log(`Remaining records with price.min = 0: ${remainingZeros}`);

    await mongoose.disconnect();
    process.exit(0);
}

fixPriceRanges().catch(err => {
    console.error("Migration error:", err);
    process.exit(1);
});

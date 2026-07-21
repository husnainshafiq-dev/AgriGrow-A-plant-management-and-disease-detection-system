// ============================================================
// 🌱 Database Seeder Script
// ============================================================
// Populates MongoDB with sample data for development/testing.
//
// Usage:
//   node scripts/seed-db.js          → Seed the database
//   node scripts/seed-db.js --clear  → Delete all data
// ============================================================

const mongoose = require("mongoose");
const path = require("path");
require("dotenv").config({ path: path.join(__dirname, "..", "server", ".env") });

// Import models
const User = require("../server/models/User");
const Farm = require("../server/models/Farm");
const Crop = require("../server/models/Crop");

const MONGO_URI = process.env.MONGO_URI || "mongodb://localhost:27017/agrigrow";

// -----------------------------------------------------------
// Sample Data
// -----------------------------------------------------------
const sampleUsers = [
    {
        name: "Demo Farmer",
        email: "demo@agrigrow.com",
        password: "password123",
        role: "user",
        location: "Karnataka, India",
    },
    {
        name: "Admin User",
        email: "admin@agrigrow.com",
        password: "admin123",
        role: "admin",
        location: "Delhi, India",
    },
];

const sampleFarms = [
    {
        name: "Green Valley Farm",
        description: "Main vegetable farm with drip irrigation system",
        location: {
            type: "Polygon",
            coordinates: [
                [
                    [77.5946, 12.9716],
                    [77.5956, 12.9716],
                    [77.5956, 12.9726],
                    [77.5946, 12.9726],
                    [77.5946, 12.9716],
                ],
            ],
        },
        center: {
            type: "Point",
            coordinates: [77.5951, 12.9721],
        },
        area: { value: 5, unit: "acres" },
        soilType: "loamy",
    },
    {
        name: "Sunrise Orchard",
        description: "Fruit orchard with mixed plantation",
        location: {
            type: "Polygon",
            coordinates: [
                [
                    [77.6100, 12.9800],
                    [77.6120, 12.9800],
                    [77.6120, 12.9820],
                    [77.6100, 12.9820],
                    [77.6100, 12.9800],
                ],
            ],
        },
        center: {
            type: "Point",
            coordinates: [77.6110, 12.9810],
        },
        area: { value: 3, unit: "acres" },
        soilType: "clay",
    },
];

const sampleCrops = [
    {
        name: "Tomato",
        variety: "Roma",
        plantingDate: new Date("2026-01-15"),
        expectedHarvestDate: new Date("2026-04-15"),
        area: { value: 2, unit: "acres" },
        costs: {
            seeds: 300,
            fertilizer: 400,
            pesticides: 240,
            labor: 1000,
            irrigation: 360,
            equipment: 200,
        },
        expectedYield: { value: 50000, unit: "kg" },
        expectedRevenue: 40000,
        status: "growing",
    },
    {
        name: "Potato",
        variety: "Russet",
        plantingDate: new Date("2026-02-01"),
        expectedHarvestDate: new Date("2026-05-01"),
        area: { value: 1.5, unit: "acres" },
        costs: {
            seeds: 375,
            fertilizer: 270,
            pesticides: 150,
            labor: 600,
            irrigation: 225,
            equipment: 180,
        },
        expectedYield: { value: 30000, unit: "kg" },
        expectedRevenue: 12000,
        status: "planted",
    },
];

// -----------------------------------------------------------
// Seed & Clear Functions
// -----------------------------------------------------------
const seedDatabase = async () => {
    try {
        await mongoose.connect(MONGO_URI);
        console.log("📦 Connected to MongoDB");

        // Clear existing data
        await User.deleteMany({});
        await Farm.deleteMany({});
        await Crop.deleteMany({});
        console.log("🧹 Cleared existing data");

        // Create users
        const users = await User.create(sampleUsers);
        console.log(`👤 Created ${users.length} users`);

        // Create farms (linked to first user)
        const farms = await Farm.create(
            sampleFarms.map((farm) => ({ ...farm, user: users[0]._id }))
        );
        console.log(`🌿 Created ${farms.length} farms`);

        // Create crops (linked to first user & first farm)
        const crops = await Crop.create(
            sampleCrops.map((crop) => ({
                ...crop,
                user: users[0]._id,
                farm: farms[0]._id,
            }))
        );
        console.log(`🌾 Created ${crops.length} crops`);

        console.log("\n✅ Database seeded successfully!");
        console.log("\n🔑 Demo credentials:");
        console.log("   Email:    demo@agrigrow.com");
        console.log("   Password: password123");

        process.exit(0);
    } catch (error) {
        console.error("❌ Seeding failed:", error.message);
        process.exit(1);
    }
};

const clearDatabase = async () => {
    try {
        await mongoose.connect(MONGO_URI);
        await User.deleteMany({});
        await Farm.deleteMany({});
        await Crop.deleteMany({});
        console.log("🧹 All data cleared!");
        process.exit(0);
    } catch (error) {
        console.error("❌ Clear failed:", error.message);
        process.exit(1);
    }
};

// -----------------------------------------------------------
// CLI
// -----------------------------------------------------------
if (process.argv.includes("--clear")) {
    clearDatabase();
} else {
    seedDatabase();
}

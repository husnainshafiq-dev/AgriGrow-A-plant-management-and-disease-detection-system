/**
 * AgriGrow - Admin Promotion & User Role Management Script
 * 
 * Usage:
 *   node scripts/make-admin.js                         -> Lists all users and their current roles
 *   node scripts/make-admin.js <email>                 -> Promotes user to 'admin'
 *   node scripts/make-admin.js <email> superadmin      -> Promotes user to 'superadmin'
 * 
 * Remote MongoDB Atlas Usage:
 *   MONGO_URI="mongodb+srv://<user>:<pwd>@cluster.mongodb.net/agrigrow" node scripts/make-admin.js <email>
 */

const mongoose = require("mongoose");
const path = require("path");
require("dotenv").config({ path: path.join(__dirname, "..", ".env") });

const User = require("../models/User");

const MONGO_URI = process.env.MONGO_URI || "mongodb://127.0.0.1:27017/agrigrow";

async function main() {
    const targetEmail = process.argv[2]?.trim().toLowerCase();
    const targetRole = (process.argv[3] || "admin").toLowerCase();

    const validRoles = ["farmer", "editor", "admin", "superadmin"];
    if (!validRoles.includes(targetRole)) {
        console.error(`❌ Invalid role: "${targetRole}". Allowed roles: ${validRoles.join(", ")}`);
        process.exit(1);
    }

    console.log(`🔗 Connecting to MongoDB: ${MONGO_URI.replace(/:([^:@]{4})[^:@]*@/, ":****@")}`);
    try {
        await mongoose.connect(MONGO_URI);
        console.log("✅ Connected successfully to database.\n");

        if (!targetEmail) {
            console.log("📋 Current Users in Database:");
            console.log("--------------------------------------------------------------------------------");
            const users = await User.find({}, "name email role createdAt").sort({ createdAt: -1 });
            if (users.length === 0) {
                console.log("No users found in database.");
            } else {
                users.forEach((u, i) => {
                    const badge = u.role === "superadmin" ? "👑 superadmin" : u.role === "admin" ? "🛡️ admin" : u.role === "editor" ? "✏️ editor" : "🌱 farmer";
                    console.log(`${i + 1}. [${badge}] ${u.name} <${u.email}> (ID: ${u._id})`);
                });
            }
            console.log("--------------------------------------------------------------------------------");
            console.log("\n💡 To promote a user to admin, run:");
            console.log("   node scripts/make-admin.js <email> [admin|superadmin]\n");
            await mongoose.disconnect();
            process.exit(0);
        }

        const user = await User.findOne({ email: targetEmail });
        if (!user) {
            console.error(`❌ User with email "${targetEmail}" was not found in the database.`);
            console.log("\nRegistered users:");
            const all = await User.find({}, "email role");
            all.forEach(u => console.log(` - ${u.email} (${u.role})`));
            await mongoose.disconnect();
            process.exit(1);
        }

        const previousRole = user.role;
        user.role = targetRole;
        await user.save();

        console.log(`🎉 SUCCESS! User "${user.name}" (${user.email}) role updated:`);
        console.log(`   Previous Role: ${previousRole}`);
        console.log(`   New Role:      ${user.role.toUpperCase()}`);
        console.log(`\nNow log in with this account at your live app to access the Admin Dashboard!`);

        await mongoose.disconnect();
        process.exit(0);
    } catch (err) {
        console.error("❌ Database connection error:", err.message);
        process.exit(1);
    }
}

main();

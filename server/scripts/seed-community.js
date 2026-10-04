// ============================================================
// 🌱 AgriGrow Community & Forum Database Seeder
// ============================================================
const mongoose = require("mongoose");
const path = require("path");
require("dotenv").config({ path: path.join(__dirname, "..", ".env") });

const { BlogPost } = require("../models/BlogPost");
const { ForumCategory, ForumThread, ForumReply, FORUM_DEFAULT_CATEGORIES } = require("../models/Forum");
const User = require("../models/User");

const MONGO_URI = process.env.MONGO_URI || "mongodb://localhost:27017/agrigrow";

const seedCommunityData = async () => {
    try {
        console.log("🌱 Connecting to MongoDB:", MONGO_URI);
        await mongoose.connect(MONGO_URI);

        // Find or create admin user for attribution
        let adminUser = await User.findOne({ role: "admin" });
        if (!adminUser) {
            adminUser = await User.findOne();
        }

        // Ensure default forum categories exist
        for (const cat of FORUM_DEFAULT_CATEGORIES) {
            await ForumCategory.findOneAndUpdate(
                { slug: cat.slug },
                { $set: cat },
                { upsert: true, new: true }
            );
        }
        const categories = await ForumCategory.find().lean();
        const categoryMap = {};
        categories.forEach(c => { categoryMap[c.slug] = c._id; });

        console.log("✅ Forum categories verified:", Object.keys(categoryMap));

        // 1. Seed Approved Blog Posts
        const samplePosts = [
            {
                title: "Complete Guide to Preventing and Treating Wheat Yellow Rust in Punjab",
                slug: "guide-wheat-yellow-rust-prevention-punjab",
                category: "disease-treatment",
                authorName: "Dr. Tariq Mahmood",
                submitterEmail: "tariq.agri@agrigrow.com",
                excerpt: "Essential preventative steps, early foliar symptoms, and targeted triazole fungicide applications for yellow rust during peak humidity.",
                content: `Wheat yellow rust (Puccinia striiformis) poses a recurring threat to wheat crops across the Punjab plains, particularly when daytime temperatures hover between 15°C and 22°C with high relative humidity or morning fog.

Key Symptoms to Watch:
1. Linear stripes of bright yellow-orange pustules (uredinia) aligned along leaf veins.
2. Premature yellowing and drying of flag leaves, which directly diminishes grain filling.
3. Chlorotic streaks preceding spore burst during cool nights.

Recommended Action Plan:
- Resistant Varieties: Prioritize varieties like Akbar-2019, Dilkash-2020, and Fakhr-e-Bhakkar which possess proven adult plant resistance.
- Early Foliar Scouting: Inspect lower canopies twice weekly from mid-January through early March.
- Targeted Chemical Control: Upon detecting first pustules, apply Tebuconazole + Trifloxystrobin (Nativo) at 65g/acre or Propiconazole (Tilt) at 200ml/100L water. Ensure thorough coverage of flag leaves.
- Balanced Nitrogen: Avoid excess late nitrogen top-dressing which stimulates dense lush foliage favorable to spore germination.`,
                coverImage: "https://images.unsplash.com/photo-1574323347407-f5e1ad6d020b?auto=format&fit=crop&w=800&q=80",
                tags: ["wheat", "rust", "disease-treatment", "punjab", "fungicide"],
                status: "approved",
                approvedBy: adminUser?._id,
                approvedAt: new Date(Date.now() - 5 * 86400000),
                publishedAt: new Date(Date.now() - 5 * 86400000),
                viewCount: 428,
                comments: [
                    {
                        authorName: "Chaudhry Noman",
                        authorEmail: "noman.farmer@gmail.com",
                        content: "Excellent advice. Sprayed tebuconazole in Sargodha last week and it halted sporulation within 48 hours.",
                        status: "approved",
                        createdAt: new Date(Date.now() - 3 * 86400000),
                    },
                    {
                        authorName: "Bilal Ahmad",
                        authorEmail: "bilal.agri@gmail.com",
                        content: "Does morning dew impact spray effectiveness? How long should we wait after sunrise before spraying?",
                        status: "approved",
                        createdAt: new Date(Date.now() - 1 * 86400000),
                    }
                ]
            },
            {
                title: "Drip Irrigation Optimization: Slashing Water Use by 45% in Cotton and Maize",
                slug: "drip-irrigation-cotton-maize-water-saving",
                category: "crop-guides",
                authorName: "Engr. Ayesha Malik",
                submitterEmail: "ayesha.irrigation@agrigrow.com",
                excerpt: "How automated sub-surface and inline drip emitters maintain ideal root-zone soil moisture while cutting diesel tubewell electricity bills in half.",
                content: `With canal rotation tightening and groundwater tables dropping, drip fertigation offers Pakistani farmers a viable path to sustain yields with half the water consumption.

System Setup and Emitter Spacing:
- Inline pressure-compensating emitters spaced at 30 cm along lateral tubes deliver uniform 1.6 to 2.2 liters per hour.
- For cotton in paired 75-cm beds, a single drip line between paired rows services both lines effectively.
- Venturi injectors enable precise micro-dosing of soluble urea and potassium sulphate directly to active roots.

Key Operational Rules:
1. Soil Tension Monitoring: Utilize tensiometers installed at 15 cm and 45 cm depth to maintain soil tension between 20 and 30 kPa.
2. Flush Filters Weekly: Disc and screen filters must be back-washed weekly to prevent silt clogging.
3. Acid Treatment: Inject technical grade phosphoric acid (1-2 liters per 1000m tube length) once a month if using brackish tubewell water to dissolve calcium carbonate scaling.`,
                coverImage: "https://images.unsplash.com/photo-1625246333195-78d9c38ad449?auto=format&fit=crop&w=800&q=80",
                tags: ["irrigation", "cotton", "maize", "water-saving", "fertigation"],
                status: "approved",
                approvedBy: adminUser?._id,
                approvedAt: new Date(Date.now() - 10 * 86400000),
                publishedAt: new Date(Date.now() - 10 * 86400000),
                viewCount: 615,
                comments: [
                    {
                        authorName: "Haji Munir",
                        authorEmail: "munir.vehari@yahoo.com",
                        content: "We installed 12 acres of drip in Vehari. Diesel expenses dropped from Rs 95,000/month to Rs 38,000.",
                        status: "approved",
                        createdAt: new Date(Date.now() - 7 * 86400000),
                    }
                ]
            },
            {
                title: "Organic Soil Enrichment: Green Manuring and Composting for Loamy Soils",
                slug: "organic-soil-enrichment-green-manuring-composting",
                category: "soil-care",
                authorName: "Chaudhry Riaz (Multan)",
                submitterEmail: "riaz.multan@gmail.com",
                excerpt: "Practical steps to incorporate Dhaincha (Sesbania) and farmyard manure to double soil organic matter and beneficial microbial activity.",
                content: `Soil organic matter across southern Punjab has dropped below 0.6% on many continuous cropping farms. Green manuring with Sesbania aculeata (Jantar/Dhaincha) is the fastest biological way to revitalize tired soils.

Step-by-Step Implementation:
1. Sowing: Broadcast 20-25 kg/acre of Dhaincha immediately after wheat harvest in May with light irrigation.
2. Growth Phase: Let it grow for 45-50 days until early flowering when plant tissues are rich in succulent nitrogen and succinic acid.
3. Incorporation: Rotavator chop the green biomass and plow into top 15 cm soil under moist conditions.
4. Microbial Inoculation: Add compost tea or Trichoderma culture to speed decomposition before planting the Kharif crop.

Results: Adds approximately 18-25 tons of green biomass, fixing 60-80 kg natural atmospheric nitrogen per acre.`,
                coverImage: "https://images.unsplash.com/photo-1592417817098-8f3d69106095?auto=format&fit=crop&w=800&q=80",
                tags: ["soil-care", "compost", "green-manure", "organic", "dhaincha"],
                status: "approved",
                approvedBy: adminUser?._id,
                approvedAt: new Date(Date.now() - 14 * 86400000),
                publishedAt: new Date(Date.now() - 14 * 86400000),
                viewCount: 520,
                comments: []
            },
            {
                title: "Protecting Tomato & Potato Crops from Sudden Winter Frost and Dense Fog",
                slug: "protecting-tomato-potato-winter-frost-fog",
                category: "weather-tips",
                authorName: "Haji Bashir Ahmad",
                submitterEmail: "bashir.kisan@gmail.com",
                excerpt: "Low-tunnel poly-sheeting and light evening canal irrigations as reliable frost defense tactics for winter vegetable growers.",
                content: `Ground radiation frost during clear, still December and January nights can wipe out standing tomato and early potato crops within hours when temperatures dip below 1°C.

Effective Defense Strategies:
1. Light Evening Irrigations: Wet soil conducts daytime heat much deeper and radiates it back into the canopy during freezing hours, keeping air 2-3°C warmer.
2. Low Tunnel Polyethylene Covers: Erect 0.04mm transparent plastic sheets over arched bamboo or steel hoops. Keep ventilated on warm sunny afternoons to avoid fungal humidity buildup.
3. Potassium & Amino Acid Sprays: Foliar application of Potassium Nitrate (13-0-45) or specialized glycine betaine 48 hours before anticipated freeze increases cell sap osmolarity, reducing freezing cell rupture.`,
                coverImage: "https://images.unsplash.com/photo-1592982537447-7440770cbfc9?auto=format&fit=crop&w=800&q=80",
                tags: ["weather-tips", "frost", "tomato", "potato", "winter"],
                status: "approved",
                approvedBy: adminUser?._id,
                approvedAt: new Date(Date.now() - 18 * 86400000),
                publishedAt: new Date(Date.now() - 18 * 86400000),
                viewCount: 389,
                comments: []
            },
            {
                title: "Success Story: How Rahim Yar Khan Farmer Scaled Sugarcane Yield to 1,150 Maunds/Acre",
                slug: "success-story-sugarcane-1150-maunds-rahim-yar-khan",
                category: "success-stories",
                authorName: "Muhammad Zubair",
                submitterEmail: "zubair.ryk@gmail.com",
                excerpt: "Adopting 4-foot deep trench planting, paired rows, and balanced potassium nutrition transformed farm profitability in southern Punjab.",
                content: `Three years ago our sugarcane yields hovered around 600-650 maunds/acre. By shifting completely from flat planting to 4-foot wide deep trench furrows and adopting balanced micronutrient feeding, we harvested 1,150 maunds/acre on 25 acres in Rahim Yar Khan.

Our Key Changes:
- Trench Furrowing: 30 cm deep trenches spaced at 4 feet allowing deep root anchorage and minimal lodging during October winds.
- Seed Selection: Two-bud sets treated with carbendazim fungicide before placement.
- Fertilizer Split: Avoided putting all DAP at sowing; split phosphate and applied 50 kg SOP (potassium sulphate) during earthing-up in April.
- Intercropping: Cultivated coriander and garlic on ridges, generating Rs 80,000/acre interim revenue that fully covered labor costs.`,
                coverImage: "https://images.unsplash.com/photo-1500937386664-56d1dfef3854?auto=format&fit=crop&w=800&q=80",
                tags: ["success-stories", "sugarcane", "yield", "rahim-yar-khan", "trench"],
                status: "approved",
                approvedBy: adminUser?._id,
                approvedAt: new Date(Date.now() - 25 * 86400000),
                publishedAt: new Date(Date.now() - 25 * 86400000),
                viewCount: 780,
                comments: [
                    {
                        authorName: "Sarfraz Gill",
                        authorEmail: "sarfraz.sadiqabad@yahoo.com",
                        content: "MashaAllah brother. What sugarcane variety did you sow? Was it CPF-249 or HSF-240?",
                        status: "approved",
                        createdAt: new Date(Date.now() - 20 * 86400000),
                    }
                ]
            }
        ];

        for (const p of samplePosts) {
            await BlogPost.findOneAndUpdate(
                { slug: p.slug },
                { $set: p },
                { upsert: true, new: true }
            );
        }
        console.log(`✅ Seeded ${samplePosts.length} approved blog posts!`);

        // 2. Seed Discussion Forum Threads & Replies
        const sampleThreads = [
            {
                title: "Curled yellow leaves and stunted growth on 35-day-old chili plants — Mites or Leaf Curl Virus?",
                slug: "curled-yellow-leaves-chili-mites-or-leaf-curl",
                categorySlug: "disease-help",
                authorName: "Asim Gujjar (Okara)",
                authorEmail: "asim.okara@gmail.com",
                body: "Noticed upper leaves curling downwards like an inverted boat on my 4-acre chili field in Okara. Veins look slightly thickened and brittle, but I don't see any whiteflies under the leaves. Can fellow growers confirm if this is broad mite damage or ChiLCV virus?",
                isSolved: true,
                moderationStatus: "approved",
                guestUpvoteCount: 14,
                replies: [
                    {
                        authorName: "Dr. Tariq Mahmood",
                        authorEmail: "tariq.agri@agrigrow.com",
                        body: "Downward cupping with elongated, leathery, brittle leaves without enations is classic Broad Mite (Polyphagotarsonemus latus) feeding injury, not Leaf Curl Virus. ChiLCV causes upward cup-curling with severe vein thickening and is transmitted by whiteflies.\n\nTreatment: Spray Abamectin (1.8% EC) at 100ml/100L water or Spiromesifen (Oberon) at 120ml/acre. Spray during late afternoon underside of leaves.",
                        isSolution: true,
                        guestUpvoteCount: 18,
                        moderationStatus: "approved",
                    },
                    {
                        authorName: "Noman Sahi",
                        authorEmail: "noman.sahiwal@gmail.com",
                        body: "Confirmed! We had the exact issue in Sahiwal last season. One application of Oberon completely stopped new curling within 5 days.",
                        isSolution: false,
                        guestUpvoteCount: 5,
                        moderationStatus: "approved",
                    }
                ]
            },
            {
                title: "Best intercropping combinations with autumn sugarcane in central Punjab?",
                slug: "best-intercropping-autumn-sugarcane-punjab",
                categorySlug: "crop-planning",
                authorName: "Sultan Mehmood (Faisalabad)",
                authorEmail: "sultan.mehmood@agri.com",
                body: "Planning to plant autumn sugarcane on 4-foot deep trenches. Which companion crop gives better cash flow without reducing ratoon cane tonnage: Garlic, Lentils, or Mustard?",
                isSolved: true,
                moderationStatus: "approved",
                guestUpvoteCount: 19,
                replies: [
                    {
                        authorName: "Chaudhry Riaz",
                        authorEmail: "riaz.multan@gmail.com",
                        body: "Garlic (Gulabi variety) or Lentils (Masoor) are by far the best choices. Garlic planted on ridge edges matures in April before the cane canopy closes, yielding up to 60-80 maunds/acre with high market value. Avoid Mustard as its heavy leafy canopy shades young tillers.",
                        isSolution: true,
                        guestUpvoteCount: 15,
                        moderationStatus: "approved",
                    }
                ]
            },
            {
                title: "Saline-alkali soil with pH 8.4: Gypsum vs elemental sulfur for reclamation?",
                slug: "saline-alkali-soil-ph-gypsum-vs-sulfur",
                categorySlug: "soil",
                authorName: "Kamran Ali (Sheikhupura)",
                authorEmail: "kamran.soil@yahoo.com",
                body: "Our soil test report shows ECe 3.8 dS/m, pH 8.4, and ESP 17%. Want to reclaim before next rice nursery. What is the recommended gypsum requirement and leaching cycle for Sheikhupura canal water?",
                isSolved: true,
                moderationStatus: "approved",
                guestUpvoteCount: 11,
                replies: [
                    {
                        authorName: "Soil Scientist Qasim",
                        authorEmail: "qasim.soil@agrigrow.com",
                        body: "With ESP at 17% and pH 8.4, you have a sodic condition where sodium ions disperse soil aggregates. Gypsum (calcium sulphate) is much more cost-effective than elemental sulfur for our calcareous soils. Apply agricultural grade gypsum (85% purity) at 2.5 tons/acre, incorporate into top 10 cm, and pond good canal water for 12-14 days. Calcium replaces exchangeable sodium and leaches it below root zone.",
                        isSolution: true,
                        guestUpvoteCount: 12,
                        moderationStatus: "approved",
                    }
                ]
            },
            {
                title: "Expected cotton phutti rates in Bahawalpur & Multan for October harvest?",
                slug: "cotton-phutti-rates-bahawalpur-multan-october",
                categorySlug: "market-prices",
                authorName: "Waqas Bhatti (Bahawalpur)",
                authorEmail: "waqas.bhatti@gmail.com",
                body: "Local ginners currently quoting Rs 7,200 - 7,600 per 40kg in Bahawalpur. Considering export demand and mill arrival pace, are rates expected to pick up later this month or is it safer to sell dry stock now?",
                isSolved: false,
                moderationStatus: "approved",
                guestUpvoteCount: 23,
                replies: [
                    {
                        authorName: "Mian Tahir (Ginners Assoc)",
                        authorEmail: "tahir.ginner@gmail.com",
                        body: "Mill arrivals are slow and quality picking is commanding a Rs 300-400 premium. If your phutti has low moisture (under 8%), hold for next week when international NY cotton futures clear.",
                        isSolution: false,
                        guestUpvoteCount: 9,
                        moderationStatus: "approved",
                    }
                ]
            },
            {
                title: "Converting 15 HP diesel tubewell to solar power: Net metering vs off-grid VFD?",
                slug: "converting-diesel-tubewell-to-solar-power-vfd",
                categorySlug: "general-farming",
                authorName: "Malik Farooq (Sahiwal)",
                authorEmail: "malik.farooq@gmail.com",
                body: "Water table depth is 55 feet with 6-inch delivery pipe. Looking for practical feedback from farmers using 18kW solar arrays with 3-phase Variable Frequency Drive (VFD). How is the performance during monsoon cloud cover?",
                isSolved: true,
                moderationStatus: "approved",
                guestUpvoteCount: 27,
                replies: [
                    {
                        authorName: "Engr. Ayesha Malik",
                        authorEmail: "ayesha.irrigation@agrigrow.com",
                        body: "For 55ft head, an 18kW array (32 x 575W mono-bifacial panels) coupled with a 15kW INVT or Veichi solar VFD runs effortlessly from 8:30 AM to 4:30 PM. With modern MPPT tracking, it still delivers 50% flow even under overcast skies. Net metering is great if you already have a 3-phase WAPDA meter; otherwise an off-grid VFD with manual changeover switch saves Rs 150,000/month in diesel.",
                        isSolution: true,
                        guestUpvoteCount: 22,
                        moderationStatus: "approved",
                    }
                ]
            }
        ];

        for (const t of sampleThreads) {
            const catId = categoryMap[t.categorySlug] || categories[0]?._id;
            let thread = await ForumThread.findOne({ slug: t.slug });
            if (!thread) {
                thread = await ForumThread.create({
                    title: t.title,
                    slug: t.slug,
                    category: catId,
                    authorName: t.authorName,
                    authorEmail: t.authorEmail,
                    body: t.body,
                    isSolved: t.isSolved,
                    moderationStatus: t.moderationStatus,
                    guestUpvoteCount: t.guestUpvoteCount,
                    replyCount: t.replies.length,
                    lastActivityAt: new Date(),
                });
            }

            // Seed replies
            for (const r of t.replies) {
                const existingReply = await ForumReply.findOne({ thread: thread._id, body: r.body });
                if (!existingReply) {
                    const createdReply = await ForumReply.create({
                        thread: thread._id,
                        authorName: r.authorName,
                        authorEmail: r.authorEmail,
                        body: r.body,
                        isSolution: r.isSolution,
                        guestUpvoteCount: r.guestUpvoteCount,
                        moderationStatus: r.moderationStatus,
                    });
                    if (r.isSolution && !thread.solvedReply) {
                        thread.solvedReply = createdReply._id;
                        await thread.save();
                    }
                }
            }
        }
        console.log(`✅ Seeded ${sampleThreads.length} active discussion threads and verified replies!`);

        console.log("🎉 Community database seeding complete!");
        process.exit(0);
    } catch (err) {
        console.error("❌ Seeding failed:", err);
        process.exit(1);
    }
};

seedCommunityData();

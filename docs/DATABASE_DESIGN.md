# 📊 Database Design — AgriGrow Farm Management App

> **STEP 1.3** — MongoDB Database Design using Mongoose  
> **Database**: MongoDB (document-oriented NoSQL)  
> **ODM**: Mongoose 8.x  
> **Collections**: users, farms, crops, disease_reports, cost_estimations

---

## 📐 ER Diagram (Text-Based)

```
╔══════════════════════════════════════════════════════════════════════════════════╗
║                        AgriGrow — Entity Relationship Diagram                ║
╠══════════════════════════════════════════════════════════════════════════════════╣
║                                                                                ║
║    ┌─────────────────┐                                                         ║
║    │     USERS       │                                                         ║
║    │─────────────────│                                                         ║
║    │ _id  (PK)       │                                                         ║
║    │ name             │                                                         ║
║    │ email (unique)   │                                                         ║
║    │ password (hashed)│                                                         ║
║    │ phone            │                                                         ║
║    │ role             │                                                         ║
║    │ avatar           │                                                         ║
║    │ address { }      │                                                         ║
║    │ location (Point) │                                                         ║
║    │ isActive         │                                                         ║
║    │ lastLogin        │                                                         ║
║    │ loginAttempts    │                                                         ║
║    │ timestamps       │                                                         ║
║    └────────┬────────┘                                                         ║
║             │                                                                  ║
║             │ 1:N (One user owns many farms)                                   ║
║             │                                                                  ║
║    ┌────────▼────────┐                                                         ║
║    │     FARMS       │                                                         ║
║    │─────────────────│                                                         ║
║    │ _id (PK)        │                                                         ║
║    │ user (FK→Users) │────── References Users._id                              ║
║    │ name            │                                                         ║
║    │ description     │                                                         ║
║    │ location (Poly) │──── GeoJSON Polygon (farm boundary)                     ║
║    │ center (Point)  │──── GeoJSON Point (map marker)                          ║
║    │ address { }     │                                                         ║
║    │ area { val,unit}│                                                         ║
║    │ soilType        │                                                         ║
║    │ soilPH          │                                                         ║
║    │ terrain         │                                                         ║
║    │ waterSource { } │──── { primary, secondary, irrigationType, availability }║
║    │ crops [FK→Crops]│────── Array of references to Crops._id                  ║
║    │ cropHistory [{}]│──── Embedded sub-documents (historical data)             ║
║    │ farmType        │                                                         ║
║    │ ownershipType   │                                                         ║
║    │ isActive        │                                                         ║
║    │ images [ ]      │                                                         ║
║    │ timestamps      │                                                         ║
║    └────────┬────────┘                                                         ║
║             │                                                                  ║
║             │ 1:N (One farm has many crops)                                    ║
║             │                                                                  ║
║    ┌────────▼────────┐          ┌──────────────────────┐                       ║
║    │     CROPS       │          │   DISEASE_REPORTS     │                       ║
║    │─────────────────│          │──────────────────────│                       ║
║    │ _id (PK)        │          │ _id (PK)             │                       ║
║    │ farm (FK→Farms) │          │ user (FK→Users)      │                       ║
║    │ user (FK→Users) │          │ farm (FK→Farms)      │ (optional)            ║
║    │ name            │          │ crop (FK→Crops)      │ (optional)            ║
║    │ variety         │          │ imageUrl             │                       ║
║    │ category        │          │ prediction { }       │──── { disease,        ║
║    │ season          │          │                      │      confidence,      ║
║    │ plantingDate    │          │                      │      isHealthy }      ║
║    │ expectedHarvest │          │ topPredictions [ ]   │                       ║
║    │ actualHarvest   │          │ aiAdvisory           │                       ║
║    │ area { }        │          │ treatmentApplied     │                       ║
║    │ costs { }       │──── {   │ userFeedback { }     │                       ║
║    │                 │  seeds, │ scanLocation (Point)  │                       ║
║    │                 │  fert,  │ weatherAtScan { }     │                       ║
║    │                 │  pest,  │ timestamps            │                       ║
║    │                 │  labor, └──────────────────────┘                       ║
║    │                 │  equip,                                                 ║
║    │                 │  etc }                                                  ║
║    │ expectedYield   │                                                         ║
║    │ actualYield     │          ┌──────────────────────┐                       ║
║    │ marketPrice     │          │  COST_ESTIMATIONS    │                       ║
║    │ expectedRevenue │          │──────────────────────│                       ║
║    │ actualRevenue   │          │ _id (PK)             │                       ║
║    │ status          │          │ user (FK→Users)      │                       ║
║    │ healthStatus    │          │ farm (FK→Farms)      │ (optional)            ║
║    │ notes           │          │ crop (FK→Crops)      │ (optional)            ║
║    │ tags [ ]        │          │ cropName             │                       ║
║    │ timestamps      │          │ area { }             │                       ║
║    └─────────────────┘          │ costSummary { }      │                       ║
║                                 │ lineItems [ ]        │                       ║
║                                 │ totalCost            │                       ║
║                                 │ expectedYield { }    │                       ║
║                                 │ expectedRevenue      │                       ║
║                                 │ expectedProfit       │                       ║
║                                 │ roi                  │                       ║
║                                 │ breakEvenYield { }   │                       ║
║                                 │ aiSuggestions { }    │                       ║
║                                 │ regionAverage { }    │                       ║
║                                 │ estimationType       │                       ║
║                                 │ timestamps           │                       ║
║                                 └──────────────────────┘                       ║
╚══════════════════════════════════════════════════════════════════════════════════╝
```

---

## 🔗 Relationship Summary

```
USERS ──< (1:N) >── FARMS            A user can own many farms
USERS ──< (1:N) >── CROPS            A user can grow many crops
USERS ──< (1:N) >── DISEASE_REPORTS   A user can have many scans
USERS ──< (1:N) >── COST_ESTIMATIONS  A user can create many cost estimates

FARMS ──< (1:N) >── CROPS            A farm can have many crops
FARMS ──< (1:N) >── DISEASE_REPORTS   A farm can have many disease scans
FARMS ──< (1:N) >── COST_ESTIMATIONS  A farm can have many cost estimates

CROPS ──< (1:N) >── DISEASE_REPORTS   A crop can have many disease scans
CROPS ──< (1:N) >── COST_ESTIMATIONS  A crop can have many cost estimates
```

### Why References (not Embedding) for Most Relationships?

| Relationship | Strategy | Reason |
|---|---|---|
| User → Farm | **Reference** (FK) | Farms are accessed independently; can grow to hundreds |
| Farm → Crop | **Reference** (FK) | Crops have their own lifecycle; queried independently |
| Farm → CropHistory | **Embedded** | Read-only historical data; always accessed with farm |
| Farm → Disease | **Reference** (FK) | Disease reports are independent resources with their own CRUD |
| Crop → CostEst. | **Reference** (FK) | Multiple estimations per crop (what-if scenarios) |

---

## 📦 Collection Details

### 1. `users` Collection

| Field | Type | Required | Default | Description |
|---|---|---|---|---|
| `name` | String | ✅ | — | User's full name (2-50 chars) |
| `email` | String | ✅ | — | Unique, lowercase, validated regex |
| `password` | String | ✅ | — | bcrypt hash, `select: false` |
| `phone` | String | ❌ | — | E.164 format validated |
| `role` | String (enum) | ❌ | `"farmer"` | `farmer` or `admin` |
| `avatar` | String | ❌ | `""` | Profile image URL |
| `address` | Object | ❌ | `{}` | `{ street, city, state, country, zipCode }` |
| `location` | GeoJSON Point | ❌ | — | `{ type: "Point", coordinates: [lng, lat] }` |
| `isActive` | Boolean | ❌ | `true` | Account activation status |
| `lastLogin` | Date | ❌ | — | Updated on successful login |
| `loginAttempts` | Number | ❌ | `0` | Failed login counter |
| `lockUntil` | Date | ❌ | — | Account lock expiry timestamp |
| `passwordChangedAt` | Date | ❌ | — | For JWT invalidation on password change |

**Indexes:**
```javascript
{ email: 1 }                  // unique — fast login lookups
{ role: 1, createdAt: -1 }    // admin queries by role
{ location: "2dsphere" }      // nearby farmer search
```

**Security Features:**
- Password hashed with **bcrypt (12 rounds)** in pre-save hook
- Password **never returned** in queries (`select: false`)
- Account **locks for 30 minutes** after 5 failed login attempts
- `passwordChangedAt` invalidates old JWT tokens after password change

---

### 2. `farms` Collection

| Field | Type | Required | Default | Description |
|---|---|---|---|---|
| `user` | ObjectId (ref: User) | ✅ | — | Farm owner |
| `name` | String | ✅ | — | Farm name (2-100 chars) |
| `description` | String | ❌ | `""` | Farm description (max 1000) |
| `location` | GeoJSON Polygon | ✅ | — | Farm boundary coordinates |
| `center` | GeoJSON Point | ❌ | `[0,0]` | Auto-calculated centroid |
| `address` | Object | ❌ | — | `{ village, district, state, country, pinCode }` |
| `area` | Object | ✅ | — | `{ value: Number, unit: "acres" }` |
| `soilType` | String (enum) | ❌ | `"other"` | 11 soil types supported |
| `soilPH` | Number | ❌ | — | 0-14 range |
| `terrain` | String (enum) | ❌ | `"flat"` | Land topology |
| `waterSource` | Object | ❌ | — | `{ primary, secondary, irrigationType, availability }` |
| `crops` | [ObjectId] | ❌ | `[]` | Refs to active Crop documents |
| `cropHistory` | [Embedded] | ❌ | `[]` | Historical crop records |
| `farmType` | String (enum) | ❌ | `"crop"` | Type of farming |
| `ownershipType` | String (enum) | ❌ | `"owned"` | Ownership classification |
| `isActive` | Boolean | ❌ | `true` | Soft delete flag |
| `images` | [Object] | ❌ | `[]` | Farm photos `{ url, caption }` |

**Indexes:**
```javascript
{ user: 1, isActive: 1 }      // "Get my active farms" (most common query)
{ user: 1, createdAt: -1 }    // Sorted listing
{ location: "2dsphere" }      // Geospatial: boundary queries
{ center: "2dsphere" }        // Geospatial: proximity search
```

**CropHistory Sub-document:**
```javascript
{
    cropName: "Rice",
    variety: "Basmati",
    season: "kharif",      // Indian crop seasons
    year: 2024,
    areaUsed: { value: 5, unit: "acres" },
    yieldObtained: { value: 2500, unit: "kg" },
    notes: "Good monsoon, above average yield"
}
```

**Cascade Delete:**  
When a farm is deleted, all associated **Crops**, **Disease Reports**, and **Cost Estimations** are automatically removed via the pre-deleteOne hook.

---

### 3. `crops` Collection

| Field | Type | Required | Default | Description |
|---|---|---|---|---|
| `farm` | ObjectId (ref: Farm) | ✅ | — | Parent farm |
| `user` | ObjectId (ref: User) | ✅ | — | Owner (denormalized for fast queries) |
| `name` | String | ✅ | — | Crop name |
| `variety` | String | ❌ | `""` | Specific variety |
| `category` | String (enum) | ❌ | `"other"` | Cereal, pulse, vegetable, etc. |
| `season` | String (enum) | ❌ | — | Kharif, rabi, zaid, etc. |
| `plantingDate` | Date | ✅ | — | When crop was planted |
| `expectedHarvestDate` | Date | ❌ | — | Projected harvest date |
| `actualHarvestDate` | Date | ❌ | — | Actual harvest date |
| `area` | Object | ✅ | — | `{ value, unit }` |
| `costs` | Object | ❌ | all 0 | `{ seeds, fertilizer, pesticides, labor, ... }` |
| `expectedYield` | Object | ❌ | — | `{ value, unit }` |
| `actualYield` | Object | ❌ | — | `{ value, unit }` |
| `marketPricePerUnit` | Number | ❌ | 0 | ₹ per kg/unit |
| `expectedRevenue` | Number | ❌ | 0 | Projected income |
| `actualRevenue` | Number | ❌ | 0 | Actual income after sale |
| `status` | String (enum) | ❌ | `"planned"` | Lifecycle stage |
| `healthStatus` | String (enum) | ❌ | `"unknown"` | Current health |

**Indexes:**
```javascript
{ farm: 1, status: 1 }        // Crops for a farm by status
{ user: 1, status: 1 }        // User's crops by status
{ user: 1, createdAt: -1 }    // Latest crops first
{ name: "text", variety: "text" } // Full-text search
```

**Virtual Properties (computed, not stored):**
```javascript
totalCost      → sum of all costs.* fields
estimatedProfit → expectedRevenue - totalCost
actualProfit   → actualRevenue - totalCost
costPerAcre    → totalCost / area.value
```

---

### 4. `disease_reports` Collection

| Field | Type | Required | Default | Description |
|---|---|---|---|---|
| `user` | ObjectId (ref: User) | ✅ | — | Scanner |
| `farm` | ObjectId (ref: Farm) | ❌ | — | Optional link to farm |
| `crop` | ObjectId (ref: Crop) | ❌ | — | Optional link to crop |
| `imageUrl` | String | ✅ | — | Uploaded image path |
| `prediction` | Object | ✅ | — | `{ disease, confidence, isHealthy }` |
| `topPredictions` | [Object] | ❌ | [] | `[{ class, probability }]` |
| `description` | String | ❌ | `""` | Disease description |
| `recommendation` | String | ❌ | `""` | Treatment recommendation |
| `aiAdvisory` | String | ❌ | `""` | Gemini-generated advice |
| `treatmentApplied` | String | ❌ | `""` | What treatment was used |
| `treatmentDate` | Date | ❌ | — | When treatment was applied |
| `resolved` | Boolean | ❌ | `false` | If the disease was resolved |
| `userFeedback` | Object | ❌ | — | `{ isAccurate, correctDisease, severity }` |
| `scanLocation` | GeoJSON Point | ❌ | — | GPS of scan location |
| `weatherAtScan` | Object | ❌ | — | `{ temperature, humidity, condition }` |

**Indexes:**
```javascript
{ user: 1, createdAt: -1 }           // User's scan history
{ farm: 1, createdAt: -1 }           // Scans per farm
{ "prediction.disease": 1 }          // Aggregate by disease type
{ "prediction.isHealthy": 1, user: 1 } // Filter healthy/diseased
{ resolved: 1, user: 1 }             // Unresolved disease tracking
```

---

### 5. `cost_estimations` Collection

| Field | Type | Required | Default | Description |
|---|---|---|---|---|
| `user` | ObjectId (ref: User) | ✅ | — | Who ran the estimation |
| `farm` | ObjectId (ref: Farm) | ❌ | — | Optional farm context |
| `crop` | ObjectId (ref: Crop) | ❌ | — | Optional crop context |
| `cropName` | String | ✅ | — | Crop name for the estimation |
| `area` | Object | ✅ | — | `{ value, unit }` |
| `costSummary` | Object | ❌ | all 0 | Quick cost breakdown |
| `lineItems` | [Object] | ❌ | [] | Detailed `{ category, amount }` |
| `totalCost` | Number | ✅ | — | Sum of all costs |
| `expectedYield` | Object | ❌ | — | Projected yield |
| `expectedRevenue` | Number | ❌ | 0 | Projected income |
| `expectedProfit` | Number | ❌ | 0 | Revenue - Cost |
| `roi` | Number | ❌ | 0 | Return on investment (%) |
| `breakEvenYield` | Object | ❌ | — | Minimum yield to break even |
| `aiSuggestions` | Object | ❌ | — | AI cost reduction tips |
| `regionAverage` | Object | ❌ | — | Benchmark data |
| `estimationType` | String (enum) | ❌ | `"quick"` | quick / detailed / ai-assisted |
| `isSaved` | Boolean | ❌ | `false` | Whether user saved this estimate |

**Indexes:**
```javascript
{ user: 1, createdAt: -1 }    // User's estimation history
{ farm: 1, crop: 1 }          // Estimations per farm-crop pair
{ cropName: 1, createdAt: -1 } // Aggregate by crop type
{ user: 1, isSaved: 1 }       // Saved estimates only
```

---

## ⚡ Indexing Strategy Summary

```
COLLECTION         INDEX                               PURPOSE
═══════════════    ═══════════════════════════════════  ══════════════════════════
users              email (unique)                       Login lookups
users              role + createdAt                     Admin role filtering
users              location (2dsphere)                  Nearby farmer search

farms              user + isActive                      "My active farms"
farms              user + createdAt                     Sorted listing
farms              location (2dsphere)                  Boundary queries
farms              center (2dsphere)                    Proximity search

crops              farm + status                        Farm's crops by status
crops              user + status                        User's crops by status
crops              user + createdAt                     Latest crops
crops              name + variety (text)                Full-text search

disease_reports    user + createdAt                     Scan history
disease_reports    farm + createdAt                     Farm scan history
disease_reports    prediction.disease                   Disease aggregation
disease_reports    prediction.isHealthy + user          Health filtering
disease_reports    resolved + user                      Unresolved tracking

cost_estimations   user + createdAt                     Estimation history
cost_estimations   farm + crop                          Farm-crop pair lookup
cost_estimations   cropName + createdAt                 Crop type aggregation
cost_estimations   user + isSaved                       Saved estimates
```

---

## 🔐 Data Integrity Rules

1. **Referential Integrity**: MongoDB doesn't enforce foreign keys, so we handle it in:
   - Application layer (Mongoose populate + validation)
   - Cascade deletes (pre-deleteOne hooks in Farm model)
   
2. **Unique Constraints**: `email` has a unique index — MongoDB enforces this at the database level

3. **Enum Validation**: Both Joi (request level) and Mongoose (schema level) validate enums

4. **Required Fields**: Enforced at both Joi and Mongoose levels (defense in depth)

5. **Soft Deletes**: `isActive: false` for users and farms (data preserved for audit)

---

## 🎓 Design Decisions Explained

### Why MongoDB over SQL?

| Factor | MongoDB (Chosen) | SQL Alternative |
|---|---|---|
| Schema flexibility | ✅ Farm features evolve rapidly | ❌ ALTER TABLE for every change |
| GeoJSON support | ✅ Native geospatial queries | ⚠️ Requires PostGIS extension |
| Embedded documents | ✅ CropHistory co-located with Farm | ❌ Separate join table needed |
| JSON response | ✅ Documents map directly to API JSON | ⚠️ ORM conversion needed |
| Scaling | ✅ Horizontal sharding built-in | ⚠️ Complex multi-master setups |

### Why Denormalize `user` in Crops?

Crops already have a `farm` reference, and farms have a `user` reference. So why store `user` in crops too?

**Performance**: To get "all crops for user X", without denormalization you'd need:
```javascript
// Without denormalization (2 queries):
const farms = await Farm.find({ user: userId });
const farmIds = farms.map(f => f._id);
const crops = await Crop.find({ farm: { $in: farmIds } });

// With denormalization (1 query):
const crops = await Crop.find({ user: userId });
```

The trade-off is slightly more storage (one ObjectId per crop = 12 bytes) vs significantly faster reads.

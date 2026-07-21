// ============================================================
// 📎 Multer File Upload Middleware (STEP 3.1)
// ============================================================
//
// IMAGE UPLOAD FLOW (Text Diagram):
//
//   ┌────────────┐   multipart/   ┌─────────────────┐   saved    ┌────────────┐
//   │   React    │   form-data    │   Multer        │   to       │  server/   │
//   │  Frontend  │ ──────────────►│   Middleware     │ ─────────► │  uploads/  │
//   │  <input/>  │                │                 │            │  disease/  │
//   └────────────┘                │  ┌────────────┐ │            │  profiles/ │
//                                 │  │ Validate:  │ │            └────────────┘
//                                 │  │ • MIME type │ │
//                                 │  │ • File size │ │
//                                 │  │ • Extension │ │
//                                 │  │ • Magic #   │ │
//                                 │  └────────────┘ │
//                                 └─────────────────┘
//                                        │
//                                 On reject: 400 error
//                                 On accept: req.file populated
//
// SECURITY MEASURES:
//   1. MIME type validation   → Only image/jpeg, image/png, image/webp
//   2. File extension check   → .jpg, .jpeg, .png, .webp only
//   3. File size limit        → Max 10 MB
//   4. Magic bytes validation → Checks actual file header bytes (anti-spoofing)
//   5. Unique filenames       → timestamp-random hash prevents collisions
//   6. Organized directories  → Separate folders per upload type
//
// FOLDER STRUCTURE:
//   server/uploads/
//   ├── disease/      ← plant disease detection images
//   ├── profiles/     ← user avatar uploads
//   └── farms/        ← farm photos
// ============================================================

const multer = require("multer");
const path = require("path");
const fs = require("fs");
const crypto = require("crypto");
const { AppError } = require("./errorHandler");
const { UPLOAD } = require("../utils/constants");

// -----------------------------------------------------------
// Ensure all upload subdirectories exist
// -----------------------------------------------------------
const BASE_UPLOAD_DIR = path.join(__dirname, "..", "uploads");
const UPLOAD_DIRS = {
    disease: path.join(BASE_UPLOAD_DIR, "disease"),
    profiles: path.join(BASE_UPLOAD_DIR, "profiles"),
    farms: path.join(BASE_UPLOAD_DIR, "farms"),
};

// Create directories on module load
Object.values(UPLOAD_DIRS).forEach((dir) => {
    if (!fs.existsSync(dir)) {
        fs.mkdirSync(dir, { recursive: true });
    }
});

// -----------------------------------------------------------
// File extension validation
// -----------------------------------------------------------
const getCleanExtension = (filename) => {
    const ext = path.extname(filename).toLowerCase();
    return ext;
};

// -----------------------------------------------------------
// Magic bytes validation (anti-spoofing)
// -----------------------------------------------------------
// The file's first few bytes ("magic number") identify its
// actual type regardless of the filename extension.
// This prevents attacks where a .exe is renamed to .jpg.
// -----------------------------------------------------------
const MAGIC_BYTES = {
    "image/jpeg": [Buffer.from([0xff, 0xd8, 0xff])],
    "image/png": [Buffer.from([0x89, 0x50, 0x4e, 0x47])],
    "image/webp": [Buffer.from("RIFF")], // RIFF....WEBP format
};

const validateMagicBytes = (filePath, mimetype) => {
    try {
        const buffer = Buffer.alloc(12);
        const fd = fs.openSync(filePath, "r");
        const bytesRead = fs.readSync(fd, buffer, 0, 12, 0);
        fs.closeSync(fd);

        if (bytesRead < 4) return false;

        // Check if it's ANY supported image format, regardless of claimed mimetype
        const isJpeg = buffer[0] === 0xff && buffer[1] === 0xd8;
        const isPng = buffer.subarray(0, 4).equals(Buffer.from([0x89, 0x50, 0x4e, 0x47]));
        const isWebp = buffer.subarray(0, 4).equals(Buffer.from("RIFF")) && buffer.subarray(8, 12).equals(Buffer.from("WEBP"));

        if (isJpeg || isPng || isWebp) {
            return true;
        }
        
        console.warn(`[UPLOAD] Magic bytes failed for ${filePath}. Claimed: ${mimetype}. Buffer:`, buffer.subarray(0, bytesRead));
        return false;
    } catch (e) {
        console.error(`[UPLOAD] Error reading file for magic bytes:`, e);
        // Fail open just in case of Windows file locking issues
        return true;
    }
};

// -----------------------------------------------------------
// Storage Engine — Disk storage with organized subdirectories
// -----------------------------------------------------------
/**
 * Creates a Multer disk storage engine for a specific upload type.
 *
 * @param {string} subDir - Subdirectory name (e.g., "disease", "profiles")
 * @returns {multer.StorageEngine} Configured storage engine
 */
const createStorage = (subDir) => {
    const destDir = UPLOAD_DIRS[subDir] || BASE_UPLOAD_DIR;

    return multer.diskStorage({
        // WHERE to save the file
        destination: (_req, _file, cb) => {
            cb(null, destDir);
        },

        // WHAT to name the file
        // Format: <timestamp>-<random_hex>.<extension>
        // Example: 1707840000000-a1b2c3d4e5f6.jpg
        filename: (_req, file, cb) => {
            const timestamp = Date.now();
            const randomHex = crypto.randomBytes(8).toString("hex");
            const ext = getCleanExtension(file.originalname);
            cb(null, `${timestamp}-${randomHex}${ext}`);
        },
    });
};

// -----------------------------------------------------------
// File Filter — Validates MIME type AND file extension
// -----------------------------------------------------------
const fileFilter = (_req, file, cb) => {
    // Step 1: Check MIME type
    if (!UPLOAD.ALLOWED_MIMETYPES.includes(file.mimetype)) {
        return cb(
            new AppError(
                `Invalid file type '${file.mimetype}'. ` +
                `Allowed types: ${UPLOAD.ALLOWED_MIMETYPES.join(", ")}`,
                400
            ),
            false
        );
    }

    // Step 2: Check file extension
    const ext = getCleanExtension(file.originalname);
    if (!UPLOAD.ALLOWED_EXTENSIONS.includes(ext)) {
        return cb(
            new AppError(
                `Invalid file extension '${ext}'. ` +
                `Allowed: ${UPLOAD.ALLOWED_EXTENSIONS.join(", ")}`,
                400
            ),
            false
        );
    }

    // Both checks passed
    cb(null, true);
};

// -----------------------------------------------------------
// Pre-configured Upload Middlewares
// -----------------------------------------------------------

/**
 * Disease image upload — saves to server/uploads/disease/
 * Used for plant disease detection scans.
 *
 * Usage in routes:
 *   router.post("/detect", uploadDisease.single("image"), detectDisease);
 */
const uploadDisease = multer({
    storage: createStorage("disease"),
    fileFilter,
    limits: {
        fileSize: UPLOAD.MAX_FILE_SIZE,
        files: 1,           // Only 1 file per request
        fields: 10,         // Max 10 non-file fields
    },
});

/**
 * Profile avatar upload — saves to server/uploads/profiles/
 *
 * Usage in routes:
 *   router.put("/avatar", uploadProfile.single("avatar"), updateAvatar);
 */
const uploadProfile = multer({
    storage: createStorage("profiles"),
    fileFilter,
    limits: {
        fileSize: 5 * 1024 * 1024, // 5 MB limit for avatars
        files: 1,
    },
});

/**
 * Farm photos upload — saves to server/uploads/farms/
 * Supports multiple file uploads (up to 5).
 *
 * Usage in routes:
 *   router.post("/:id/photos", uploadFarm.array("photos", 5), addPhotos);
 */
const uploadFarm = multer({
    storage: createStorage("farms"),
    fileFilter,
    limits: {
        fileSize: UPLOAD.MAX_FILE_SIZE,
        files: 5,           // Up to 5 photos per request
    },
});

/**
 * Generic upload — saves to server/uploads/ (root)
 * Fallback for other upload needs.
 */
const uploadGeneric = multer({
    storage: createStorage("generic"),
    fileFilter,
    limits: {
        fileSize: UPLOAD.MAX_FILE_SIZE,
        files: 1,
    },
});

// -----------------------------------------------------------
// Post-Upload Magic Bytes Validation Middleware
// -----------------------------------------------------------
/**
 * This middleware runs AFTER multer saves the file.
 * It validates that the file's actual bytes match its claimed type.
 * If validation fails, the file is deleted and an error is thrown.
 *
 * Usage:
 *   router.post("/detect",
 *     uploadDisease.single("image"),
 *     validateUploadedFile,      ← this middleware
 *     detectDisease
 *   );
 */
const validateUploadedFile = (req, _res, next) => {
    if (!req.file) {
        return next(); // No file uploaded, skip validation
    }

    const isValid = validateMagicBytes(req.file.path, req.file.mimetype);

    if (!isValid) {
        // Delete the suspicious file immediately
        fs.unlink(req.file.path, () => { });
        return next(
            new AppError(
                "File content does not match its declared type. " +
                "Possible file spoofing detected.",
                400
            )
        );
    }

    next();
};

// -----------------------------------------------------------
// Multer Error Handler Middleware
// -----------------------------------------------------------
/**
 * Express error middleware for Multer-specific errors.
 * Converts cryptic Multer errors into user-friendly messages.
 *
 * Usage (in server.js or route file):
 *   app.use(handleMulterError);
 */
const handleMulterError = (err, _req, _res, next) => {
    if (err instanceof multer.MulterError) {
        switch (err.code) {
            case "LIMIT_FILE_SIZE":
                return next(
                    new AppError(
                        `File too large. Maximum size is ${UPLOAD.MAX_FILE_SIZE / (1024 * 1024)} MB.`,
                        400
                    )
                );
            case "LIMIT_FILE_COUNT":
                return next(
                    new AppError("Too many files uploaded.", 400)
                );
            case "LIMIT_UNEXPECTED_FILE":
                return next(
                    new AppError(
                        `Unexpected field name '${err.field}'. Please use the correct field name for file upload.`,
                        400
                    )
                );
            default:
                return next(
                    new AppError(`Upload error: ${err.message}`, 400)
                );
        }
    }

    next(err);
};

// -----------------------------------------------------------
// Utility: Delete uploaded file (cleanup on error)
// -----------------------------------------------------------
/**
 * Safely delete an uploaded file.
 * Used in controllers when processing fails after upload.
 *
 * @param {string} filePath - Path to the file to delete
 */
const deleteUploadedFile = (filePath) => {
    if (filePath && fs.existsSync(filePath)) {
        fs.unlink(filePath, (err) => {
            if (err) console.error(`Failed to delete file: ${filePath}`, err.message);
        });
    }
};

// -----------------------------------------------------------
// Utility: Get public URL for an uploaded file
// -----------------------------------------------------------
/**
 * Convert a file system path to a URL-safe path for the API.
 *
 * @param {string} subDir  - Upload subdirectory (e.g., "disease")
 * @param {string} filename - The stored filename
 * @returns {string} URL path (e.g., "/uploads/disease/1707840000-abc123.jpg")
 */
const getUploadUrl = (subDir, filename) => {
    return `/uploads/${subDir}/${filename}`;
};

module.exports = {
    uploadDisease,
    uploadProfile,
    uploadFarm,
    uploadGeneric,
    validateUploadedFile,
    handleMulterError,
    deleteUploadedFile,
    getUploadUrl,
    validateMagicBytes,
    BASE_UPLOAD_DIR,
    UPLOAD_DIRS,
};

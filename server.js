const express = require("express");
const multer = require("multer");
const cors = require("cors");
const path = require("path");
const fs = require("fs");
const { spawn } = require("child_process");
const readline = require("readline");

// ---------------------------------------------------------------------------
// Config
// ---------------------------------------------------------------------------
const PORT = process.env.PORT || 5000;
const UPLOADS_DIR = path.join(__dirname, "uploads");
if (!fs.existsSync(UPLOADS_DIR)) fs.mkdirSync(UPLOADS_DIR);

const app = express();
app.use(cors());

// Multer — save uploaded images to /uploads
const upload = multer({
    dest: UPLOADS_DIR,
    limits: { fileSize: 10 * 1024 * 1024 }, // 10 MB
    fileFilter: (_req, file, cb) => {
        const ok = ["image/jpeg", "image/png", "image/webp"].includes(file.mimetype);
        cb(null, ok);
    },
});

// ---------------------------------------------------------------------------
// Spawn persistent Python inference process
// ---------------------------------------------------------------------------
let pythonReady = false;
const pendingQueue = []; // { resolve, reject, timer }

const py = spawn("python", [path.join(__dirname, "predict_server.py")], {
    stdio: ["pipe", "pipe", "pipe"],
});

const rl = readline.createInterface({ input: py.stdout });

// Python stderr → console (TF logs etc.)
py.stderr.on("data", (buf) => {
    const msg = buf.toString().trim();
    if (msg) console.log("[python]", msg);
});

rl.on("line", (line) => {
    try {
        const data = JSON.parse(line);
        if (data.status === "ready") {
            pythonReady = true;
            console.log("✅  Model loaded — ready for predictions");
            return;
        }
        const pending = pendingQueue.shift();
        if (pending) {
            clearTimeout(pending.timer);
            pending.resolve(data);
        }
    } catch {
        console.error("⚠️  Could not parse Python output:", line);
    }
});

py.on("exit", (code) => {
    console.error(`❌  Python process exited (code ${code})`);
    pythonReady = false;
});

function predict(imagePath) {
    return new Promise((resolve, reject) => {
        if (!pythonReady) return reject(new Error("Model is still loading — please wait"));

        const timer = setTimeout(() => {
            reject(new Error("Prediction timed out"));
        }, 60_000);

        pendingQueue.push({ resolve, reject, timer });
        py.stdin.write(imagePath + "\n");
    });
}

// ---------------------------------------------------------------------------
// API routes
// ---------------------------------------------------------------------------
app.post("/api/predict", upload.single("file"), async (req, res) => {
    if (!req.file) return res.status(400).json({ error: "No image file uploaded" });

    try {
        const result = await predict(req.file.path);
        fs.unlink(req.file.path, () => { }); // clean up temp file
        if (result.error) return res.status(500).json(result);
        return res.json(result);
    } catch (err) {
        fs.unlink(req.file.path, () => { });
        return res.status(500).json({ error: err.message });
    }
});

app.get("/api/health", (_req, res) => {
    res.json({ status: pythonReady ? "ready" : "loading" });
});

// ---------------------------------------------------------------------------
// Serve React build in production
// ---------------------------------------------------------------------------
const clientDist = path.join(__dirname, "client", "dist");
if (process.env.NODE_ENV === "production" && fs.existsSync(clientDist)) {
    app.use(express.static(clientDist));
    app.get("*", (_req, res) => res.sendFile(path.join(clientDist, "index.html")));
}

// ---------------------------------------------------------------------------
app.listen(PORT, () => {
    console.log(`🚀  Server running → http://localhost:${PORT}`);
    console.log("⏳  Loading AI model …");
});

const multer = require("multer");
const os = require("os");
const path = require("path");
const crypto = require("crypto");

// Files land in the OS temp folder briefly (just for the life of the
// request) before we push them on to Cloudinary ourselves in the route
// handler — see routes/media.js. They're deleted right after.
const storage = multer.diskStorage({
  destination: (req, file, cb) => cb(null, os.tmpdir()),
  filename: (req, file, cb) => {
    const unique = `${Date.now()}-${crypto.randomBytes(6).toString("hex")}`;
    cb(null, unique + path.extname(file.originalname || ""));
  },
});

const upload = multer({
  storage,
  limits: {
    fileSize: 200 * 1024 * 1024, // 200MB per file
  },
  fileFilter: (req, file, cb) => {
    const allowed = /^(image|video)\//;
    if (allowed.test(file.mimetype) || file.mimetype === "application/pdf") {
      cb(null, true);
    } else {
      cb(new Error("Only image, video, and PDF files are allowed"));
    }
  },
});

module.exports = upload;

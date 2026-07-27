const multer = require("multer");
const { CloudinaryStorage } = require("multer-storage-cloudinary");
const cloudinary = require("../config/cloudinary");

const storage = new CloudinaryStorage({
  cloudinary: cloudinary,
  params: async (req, file) => {
    const isVideo = file.mimetype.startsWith("video/");
    return {
      folder: "my-gallery",
      resource_type: isVideo ? "video" : "image",
      // The Cloudinary SDK's own upload request has a default internal
      // timeout of just 60 seconds — on a slower connection (like Render's
      // free tier), a video upload can easily take longer than that and get
      // silently aborted, even though our own server/frontend timeouts are
      // set much higher. Raising it here fixes that at the actual source.
      timeout: 300000, // 5 minutes
    };
  },
});

const upload = multer({
  storage,
  limits: {
    fileSize: 200 * 1024 * 1024, // 200MB per file (Cloudinary free tier max is ~100MB for video by default, adjust if needed)
  },
  fileFilter: (req, file, cb) => {
    const allowed = /^(image|video)\//;
    if (allowed.test(file.mimetype)) {
      cb(null, true);
    } else {
      cb(new Error("Only image and video files are allowed"));
    }
  },
});

module.exports = upload;

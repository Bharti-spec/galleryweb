const cloudinary = require("cloudinary").v2;

cloudinary.config({
  cloud_name: process.env.CLOUDINARY_CLOUD_NAME,
  api_key: process.env.CLOUDINARY_API_KEY,
  api_secret: process.env.CLOUDINARY_API_SECRET,
  timeout: 300000, // 5 min default for every Cloudinary call (uploads, deletes, etc.),
  // instead of the SDK's own 60s default which was too short for larger
  // files on a slower connection.
});

module.exports = cloudinary;

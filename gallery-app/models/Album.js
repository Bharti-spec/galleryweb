const mongoose = require("mongoose");

const albumSchema = new mongoose.Schema({
  user: {
    type: mongoose.Schema.Types.ObjectId,
    ref: "User",
    required: true,
    index: true,
  },
  name: {
    type: String,
    required: true,
    trim: true,
  },
  // "media" = regular photo/video albums, "files" = PDF folders. Keeps the
  // two organization systems completely separate so photos/videos and PDFs
  // never end up mixed in the same album.
  kind: {
    type: String,
    enum: ["media", "files"],
    default: "media",
    index: true,
  },
  shareToken: {
    type: String,
    unique: true,
    sparse: true,
  },
  createdAt: {
    type: Date,
    default: Date.now,
  },
});

module.exports = mongoose.model("Album", albumSchema);

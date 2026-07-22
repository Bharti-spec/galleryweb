const mongoose = require("mongoose");

const mediaSchema = new mongoose.Schema({
  user: {
    type: mongoose.Schema.Types.ObjectId,
    ref: "User",
    required: true,
    index: true,
  },
  album: {
    type: mongoose.Schema.Types.ObjectId,
    ref: "Album",
    default: null,
    index: true,
  },
  url: {
    type: String,
    required: true,
  },
  publicId: {
    type: String,
    required: true,
  },
  type: {
    type: String,
    enum: ["image", "video"],
    required: true,
  },
  originalName: String,
  bytes: Number,
  favorite: {
    type: Boolean,
    default: false,
    index: true,
  },
  shareToken: {
    type: String,
    default: null,
    unique: true,
    sparse: true,
  },
  createdAt: {
    type: Date,
    default: Date.now,
  },
  deletedAt: {
    type: Date,
    default: null,
    index: true,
  },
});

module.exports = mongoose.model("Media", mediaSchema);

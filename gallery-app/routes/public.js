const express = require("express");
const Media = require("../models/Media");
const Album = require("../models/Album");

const router = express.Router();

// GET /api/public/media/:token - view a single shared photo/video, no login needed
router.get("/media/:token", async (req, res) => {
  try {
    const item = await Media.findOne({
      shareToken: req.params.token,
      deletedAt: null,
    });

    if (!item) {
      return res.status(404).json({ error: "Ye link valid nahi hai ya expire ho chuka hai" });
    }

    res.json({
      type: "media",
      media: {
        url: item.url,
        type: item.type,
        originalName: item.originalName,
      },
    });
  } catch (err) {
    console.error(err);
    res.status(500).json({ error: "Kuch gadbad ho gayi" });
  }
});

// GET /api/public/album/:token - view a whole shared album (read-only), no login needed
router.get("/album/:token", async (req, res) => {
  try {
    const album = await Album.findOne({ shareToken: req.params.token });

    if (!album) {
      return res.status(404).json({ error: "Ye link valid nahi hai ya expire ho chuka hai" });
    }

    const media = await Media.find({
      album: album._id,
      deletedAt: null,
    }).sort({ createdAt: -1 });

    res.json({
      type: "album",
      album: { name: album.name },
      media: media.map((m) => ({
        _id: m._id,
        url: m.url,
        type: m.type,
        originalName: m.originalName,
      })),
    });
  } catch (err) {
    console.error(err);
    res.status(500).json({ error: "Kuch gadbad ho gayi" });
  }
});

module.exports = router;

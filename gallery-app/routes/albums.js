const express = require("express");
const crypto = require("crypto");
const Album = require("../models/Album");
const Media = require("../models/Media");
const requireAuth = require("../middleware/auth");

const router = express.Router();

// GET /api/albums - list user's albums with item count + a cover thumbnail
router.get("/", requireAuth, async (req, res) => {
  try {
    const albums = await Album.find({ user: req.userId }).sort({ createdAt: -1 });

    const withCovers = await Promise.all(
      albums.map(async (album) => {
        const count = await Media.countDocuments({
          user: req.userId,
          album: album._id,
          deletedAt: null,
        });
        const cover = await Media.findOne({
          user: req.userId,
          album: album._id,
          deletedAt: null,
        }).sort({ createdAt: -1 });

        return {
          _id: album._id,
          name: album.name,
          createdAt: album.createdAt,
          count,
          coverUrl: cover ? cover.url : null,
          coverType: cover ? cover.type : null,
        };
      })
    );

    res.json({ albums: withCovers });
  } catch (err) {
    console.error(err);
    res.status(500).json({ error: "Could not load albums" });
  }
});

// POST /api/albums - create a new album
router.post("/", requireAuth, async (req, res) => {
  try {
    const name = (req.body.name || "").trim();
    if (!name) {
      return res.status(400).json({ error: "Album ka naam dalein" });
    }

    const album = await Album.create({ user: req.userId, name });
    res.status(201).json({ album });
  } catch (err) {
    console.error(err);
    res.status(500).json({ error: "Album nahi ban paya" });
  }
});

// POST /api/albums/:id/share - generate (or return existing) a public share link for the album
router.post("/:id/share", requireAuth, async (req, res) => {
  try {
    const album = await Album.findOne({ _id: req.params.id, user: req.userId });
    if (!album) {
      return res.status(404).json({ error: "Album not found" });
    }

    if (!album.shareToken) {
      album.shareToken = crypto.randomBytes(16).toString("hex");
      await album.save();
    }

    res.json({ shareToken: album.shareToken });
  } catch (err) {
    console.error(err);
    res.status(500).json({ error: "Could not create share link" });
  }
});

// DELETE /api/albums/:id/share - revoke the album's public share link
router.delete("/:id/share", requireAuth, async (req, res) => {
  try {
    const album = await Album.findOne({ _id: req.params.id, user: req.userId });
    if (!album) {
      return res.status(404).json({ error: "Album not found" });
    }

    album.shareToken = null;
    await album.save();

    res.json({ success: true });
  } catch (err) {
    console.error(err);
    res.status(500).json({ error: "Could not revoke share link" });
  }
});

// DELETE /api/albums/:id - delete the album only; media stays, just unassigned
router.delete("/:id", requireAuth, async (req, res) => {
  try {
    const album = await Album.findOne({ _id: req.params.id, user: req.userId });
    if (!album) {
      return res.status(404).json({ error: "Album not found" });
    }

    await Media.updateMany(
      { user: req.userId, album: album._id },
      { $set: { album: null } }
    );
    await album.deleteOne();

    res.json({ success: true });
  } catch (err) {
    console.error(err);
    res.status(500).json({ error: "Album delete nahi ho paya" });
  }
});

module.exports = router;

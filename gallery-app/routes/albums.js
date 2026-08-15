const express = require("express");
const crypto = require("crypto");
const Album = require("../models/Album");
const Media = require("../models/Media");
const requireAuth = require("../middleware/auth");

const router = express.Router();

function logError(err) {
  console.error(err && err.stack ? err.stack : err);
}

// GET /api/albums - list user's albums with item count + a cover thumbnail
// ?kind=media (default) for photo/video albums, ?kind=files for PDF folders
router.get("/", requireAuth, async (req, res) => {
  try {
    const kind = req.query.kind === "files" ? "files" : "media";
    const albums = await Album.find({ user: req.userId, kind }).sort({ createdAt: -1 });

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
          kind: album.kind,
          createdAt: album.createdAt,
          count,
          coverUrl: cover ? cover.url : null,
          coverType: cover ? cover.type : null,
        };
      })
    );

    res.json({ albums: withCovers });
  } catch (err) {
    logError(err);
    res.status(500).json({ error: "Could not load albums" });
  }
});

// POST /api/albums - create a new album (kind: "media" or "files")
router.post("/", requireAuth, async (req, res) => {
  try {
    const name = (req.body.name || "").trim();
    if (!name) {
      return res.status(400).json({ error: "Album ka naam dalein" });
    }
    const kind = req.body.kind === "files" ? "files" : "media";

    const album = await Album.create({ user: req.userId, name, kind });
    res.status(201).json({ album });
  } catch (err) {
    logError(err);
    res.status(500).json({ error: "Album nahi ban paya" });
  }
});

// PATCH /api/albums/:id - rename an album
router.patch("/:id", requireAuth, async (req, res) => {
  try {
    const name = (req.body.name || "").trim();
    if (!name) {
      return res.status(400).json({ error: "Album ka naam dalein" });
    }

    const album = await Album.findOne({ _id: req.params.id, user: req.userId });
    if (!album) {
      return res.status(404).json({ error: "Album not found" });
    }

    album.name = name;
    await album.save();

    res.json({ album });
  } catch (err) {
    logError(err);
    res.status(500).json({ error: "Album rename nahi ho paya" });
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
    logError(err);
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
    logError(err);
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
    logError(err);
    res.status(500).json({ error: "Album delete nahi ho paya" });
  }
});

module.exports = router;

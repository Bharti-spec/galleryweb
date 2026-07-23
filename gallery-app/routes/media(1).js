const express = require("express");
const crypto = require("crypto");
const mongoose = require("mongoose");
const Media = require("../models/Media");
const cloudinary = require("../config/cloudinary");
const requireAuth = require("../middleware/auth");
const upload = require("../middleware/upload");

const router = express.Router();

const TRASH_RETENTION_DAYS = 30;

// Permanently removes anything that has been sitting in trash longer than
// the retention window. Runs quietly whenever a user loads their gallery
// or trash, so we don't need a separate scheduled job.
async function purgeExpiredTrash(userId) {
  const cutoff = new Date(Date.now() - TRASH_RETENTION_DAYS * 24 * 60 * 60 * 1000);
  const expired = await Media.find({
    user: userId,
    deletedAt: { $ne: null, $lte: cutoff },
  });

  for (const item of expired) {
    try {
      await cloudinary.uploader.destroy(item.publicId, {
        resource_type: item.type === "video" ? "video" : "image",
      });
    } catch (err) {
      console.error("Cloudinary cleanup failed for", item._id, err.message);
    }
    await item.deleteOne();
  }
}

// GET /api/media - active (non-trashed) media, optionally filtered by album
router.get("/", requireAuth, async (req, res) => {
  try {
    await purgeExpiredTrash(req.userId);

    const filter = { user: req.userId, deletedAt: null };
    if (req.query.albumId) {
      filter.album = req.query.albumId === "none" ? null : req.query.albumId;
    }
    if (req.query.favorite === "true") {
      filter.favorite = true;
    }

    const media = await Media.find(filter).sort({ createdAt: -1 });
    res.json({ media });
  } catch (err) {
    console.error(err);
    res.status(500).json({ error: "Could not load your gallery" });
  }
});

// GET /api/media/trash - items currently in trash
router.get("/trash", requireAuth, async (req, res) => {
  try {
    await purgeExpiredTrash(req.userId);

    const media = await Media.find({
      user: req.userId,
      deletedAt: { $ne: null },
    }).sort({ deletedAt: -1 });

    res.json({ media, retentionDays: TRASH_RETENTION_DAYS });
  } catch (err) {
    console.error(err);
    res.status(500).json({ error: "Could not load trash" });
  }
});

// GET /api/media/storage - how much space this user's active media is using
router.get("/storage", requireAuth, async (req, res) => {
  try {
    const result = await Media.aggregate([
      { $match: { user: new mongoose.Types.ObjectId(req.userId), deletedAt: null } },
      {
        $group: {
          _id: null,
          totalBytes: { $sum: "$bytes" },
          count: { $sum: 1 },
        },
      },
    ]);

    const totalBytes = result.length > 0 ? result[0].totalBytes : 0;
    const count = result.length > 0 ? result[0].count : 0;

    res.json({ totalBytes, count });
  } catch (err) {
    console.error(err);
    res.status(500).json({ error: "Could not load storage info" });
  }
});
router.post("/upload", requireAuth, upload.array("files", 20), async (req, res) => {
  try {
    if (!req.files || req.files.length === 0) {
      return res.status(400).json({ error: "No files were received" });
    }

    const albumId = req.body.albumId || null;

    const saved = await Promise.all(
      req.files.map((file) =>
        Media.create({
          user: req.userId,
          album: albumId,
          url: file.path,
          publicId: file.filename,
          type: file.mimetype.startsWith("video/") ? "video" : "image",
          originalName: file.originalname,
          bytes: file.size,
        })
      )
    );

    res.status(201).json({ media: saved });
  } catch (err) {
    console.error(err);
    res.status(500).json({ error: "Upload failed, please try again" });
  }
});

// PATCH /api/media/bulk/album - assign or remove a set of items from an album
router.patch("/bulk/album", requireAuth, async (req, res) => {
  try {
    const { ids, albumId } = req.body;
    if (!Array.isArray(ids) || ids.length === 0) {
      return res.status(400).json({ error: "No items selected" });
    }

    await Media.updateMany(
      { _id: { $in: ids }, user: req.userId },
      { $set: { album: albumId || null } }
    );

    res.json({ success: true });
  } catch (err) {
    console.error(err);
    res.status(500).json({ error: "Could not update album" });
  }
});

// PATCH /api/media/bulk/favorite - mark/unmark multiple items as favorite
router.patch("/bulk/favorite", requireAuth, async (req, res) => {
  try {
    const { ids, favorite } = req.body;
    if (!Array.isArray(ids) || ids.length === 0) {
      return res.status(400).json({ error: "No items selected" });
    }

    await Media.updateMany(
      { _id: { $in: ids }, user: req.userId },
      { $set: { favorite: !!favorite } }
    );

    res.json({ success: true });
  } catch (err) {
    console.error(err);
    res.status(500).json({ error: "Could not update favorites" });
  }
});

// POST /api/media/bulk/trash - move multiple items to trash
router.post("/bulk/trash", requireAuth, async (req, res) => {
  try {
    const { ids } = req.body;
    if (!Array.isArray(ids) || ids.length === 0) {
      return res.status(400).json({ error: "No items selected" });
    }

    await Media.updateMany(
      { _id: { $in: ids }, user: req.userId },
      { $set: { deletedAt: new Date() } }
    );

    res.json({ success: true });
  } catch (err) {
    console.error(err);
    res.status(500).json({ error: "Could not move items to trash" });
  }
});

// POST /api/media/bulk/restore - restore multiple items from trash
router.post("/bulk/restore", requireAuth, async (req, res) => {
  try {
    const { ids } = req.body;
    if (!Array.isArray(ids) || ids.length === 0) {
      return res.status(400).json({ error: "No items selected" });
    }

    await Media.updateMany(
      { _id: { $in: ids }, user: req.userId },
      { $set: { deletedAt: null } }
    );

    res.json({ success: true });
  } catch (err) {
    console.error(err);
    res.status(500).json({ error: "Could not restore items" });
  }
});

// DELETE /api/media/bulk/permanent - permanently delete multiple items (from trash)
router.delete("/bulk/permanent", requireAuth, async (req, res) => {
  try {
    const { ids } = req.body;
    if (!Array.isArray(ids) || ids.length === 0) {
      return res.status(400).json({ error: "No items selected" });
    }

    const items = await Media.find({ _id: { $in: ids }, user: req.userId });

    for (const item of items) {
      try {
        await cloudinary.uploader.destroy(item.publicId, {
          resource_type: item.type === "video" ? "video" : "image",
        });
      } catch (err) {
        console.error("Cloudinary delete failed for", item._id, err.message);
      }
      await item.deleteOne();
    }

    res.json({ success: true });
  } catch (err) {
    console.error(err);
    res.status(500).json({ error: "Could not delete items" });
  }
});

// PATCH /api/media/:id/favorite - toggle favorite on a single item
router.patch("/:id/favorite", requireAuth, async (req, res) => {
  try {
    const item = await Media.findOne({ _id: req.params.id, user: req.userId });
    if (!item) {
      return res.status(404).json({ error: "File not found" });
    }

    item.favorite = req.body.favorite !== undefined ? !!req.body.favorite : !item.favorite;
    await item.save();

    res.json({ favorite: item.favorite });
  } catch (err) {
    console.error(err);
    res.status(500).json({ error: "Could not update favorite" });
  }
});

// POST /api/media/:id/share - generate (or return existing) a public share link
router.post("/:id/share", requireAuth, async (req, res) => {
  try {
    const item = await Media.findOne({ _id: req.params.id, user: req.userId });
    if (!item) {
      return res.status(404).json({ error: "File not found" });
    }

    if (!item.shareToken) {
      item.shareToken = crypto.randomBytes(16).toString("hex");
      await item.save();
    }

    res.json({ shareToken: item.shareToken });
  } catch (err) {
    console.error(err);
    res.status(500).json({ error: "Could not create share link" });
  }
});

// DELETE /api/media/:id/share - revoke a public share link
router.delete("/:id/share", requireAuth, async (req, res) => {
  try {
    const item = await Media.findOne({ _id: req.params.id, user: req.userId });
    if (!item) {
      return res.status(404).json({ error: "File not found" });
    }

    item.shareToken = null;
    await item.save();

    res.json({ success: true });
  } catch (err) {
    console.error(err);
    res.status(500).json({ error: "Could not revoke share link" });
  }
});

// DELETE /api/media/:id - move a single item to trash (soft delete)
router.delete("/:id", requireAuth, async (req, res) => {
  try {
    const item = await Media.findOne({ _id: req.params.id, user: req.userId });
    if (!item) {
      return res.status(404).json({ error: "File not found" });
    }

    item.deletedAt = new Date();
    await item.save();

    res.json({ success: true });
  } catch (err) {
    console.error(err);
    res.status(500).json({ error: "Could not delete this file" });
  }
});

// POST /api/media/:id/restore - restore a single item from trash
router.post("/:id/restore", requireAuth, async (req, res) => {
  try {
    const item = await Media.findOne({ _id: req.params.id, user: req.userId });
    if (!item) {
      return res.status(404).json({ error: "File not found" });
    }

    item.deletedAt = null;
    await item.save();

    res.json({ success: true });
  } catch (err) {
    console.error(err);
    res.status(500).json({ error: "Could not restore this file" });
  }
});

// DELETE /api/media/:id/permanent - permanently delete a single item
router.delete("/:id/permanent", requireAuth, async (req, res) => {
  try {
    const item = await Media.findOne({ _id: req.params.id, user: req.userId });
    if (!item) {
      return res.status(404).json({ error: "File not found" });
    }

    await cloudinary.uploader.destroy(item.publicId, {
      resource_type: item.type === "video" ? "video" : "image",
    });
    await item.deleteOne();

    res.json({ success: true });
  } catch (err) {
    console.error(err);
    res.status(500).json({ error: "Could not delete this file" });
  }
});

module.exports = router;

const express = require("express");
const fs = require("fs");
const crypto = require("crypto");
const mongoose = require("mongoose");
const archiver = require("archiver");
const { Readable } = require("stream");
const Media = require("../models/Media");
const cloudinary = require("../config/cloudinary");
const requireAuth = require("../middleware/auth");
const upload = require("../middleware/upload");

const router = express.Router();

// Logs the fullest useful detail for an error (stack trace when available)
// instead of just "[object Object]", which Render's log viewer otherwise
// shows for plain console.error(err) calls.
function logError(err) {
  console.error(err && err.stack ? err.stack : err);
}

// Turns any error value (including plain objects like Cloudinary's own
// timeout/network errors, which aren't real Error instances) into a
// readable string instead of "[object Object]".
function describeError(err) {
  if (!err) return "Unknown error";
  if (err instanceof Error) return err.stack || err.message;
  try {
    return JSON.stringify(err, Object.getOwnPropertyNames(err));
  } catch {
    return String(err);
  }
}

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
// Supports pagination via ?page=1&limit=60 so large galleries load in chunks.
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

    const page = Math.max(parseInt(req.query.page) || 1, 1);
    const limit = Math.min(Math.max(parseInt(req.query.limit) || 60, 1), 200);
    const skip = (page - 1) * limit;

    const media = await Media.find(filter).sort({ createdAt: -1 }).skip(skip).limit(limit);
    const hasMore = media.length === limit;

    res.json({ media, hasMore, page });
  } catch (err) {
    logError(err);
    res.status(500).json({ error: "Could not load your gallery" });
  }
});

// GET /api/media/trash - items currently in trash (also paginated)
router.get("/trash", requireAuth, async (req, res) => {
  try {
    await purgeExpiredTrash(req.userId);

    const page = Math.max(parseInt(req.query.page) || 1, 1);
    const limit = Math.min(Math.max(parseInt(req.query.limit) || 60, 1), 200);
    const skip = (page - 1) * limit;

    const media = await Media.find({
      user: req.userId,
      deletedAt: { $ne: null },
    })
      .sort({ deletedAt: -1 })
      .skip(skip)
      .limit(limit);

    const hasMore = media.length === limit;

    res.json({ media, hasMore, page, retentionDays: TRASH_RETENTION_DAYS });
  } catch (err) {
    logError(err);
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
    logError(err);
    res.status(500).json({ error: "Could not load storage info" });
  }
});

// GET /api/media/export - download everything (or one album) as a single zip file.
// Streams straight through to the response so the whole zip never has to sit
// in server memory at once.
router.get("/export", requireAuth, async (req, res) => {
  try {
    const filter = { user: req.userId, deletedAt: null };
    if (req.query.albumId) {
      filter.album = req.query.albumId;
    }

    const media = await Media.find(filter).sort({ createdAt: -1 });

    if (media.length === 0) {
      return res.status(404).json({ error: "Export karne ke liye gallery mein kuch nahi hai" });
    }

    res.setHeader("Content-Type", "application/zip");
    res.setHeader("Content-Disposition", 'attachment; filename="my-gallery-backup.zip"');

    const archive = archiver("zip", { zlib: { level: 5 } });
    archive.on("error", (err) => {
      console.error("Archive error:", err.message);
      if (!res.headersSent) res.status(500);
      res.end();
    });
    archive.pipe(res);

    const usedNames = new Set();

    for (const item of media) {
      try {
        const response = await fetch(item.url);
        if (!response.ok || !response.body) continue;

        const nodeStream = Readable.fromWeb(response.body);

        const baseName = item.originalName || `${item._id}.${item.type === "video" ? "mp4" : "jpg"}`;
        let finalName = baseName;
        let counter = 1;
        while (usedNames.has(finalName)) {
          const dot = baseName.lastIndexOf(".");
          finalName = dot > -1 ? `${baseName.slice(0, dot)} (${counter})${baseName.slice(dot)}` : `${baseName} (${counter})`;
          counter++;
        }
        usedNames.add(finalName);

        archive.append(nodeStream, { name: finalName });
      } catch (err) {
        console.error("Skipping file in export:", item._id, err.message);
      }
    }

    await archive.finalize();
  } catch (err) {
    logError(err);
    if (!res.headersSent) {
      res.status(500).json({ error: "Backup nahi ban paya" });
    }
  }
});
// cloudinary.uploader.upload_large() returns the underlying write stream
// rather than a real promise, even when awaited directly — so without
// wrapping it like this, our code would race ahead with an incomplete
// upload every time instead of actually waiting for it to finish.
function uploadLargeAsync(filePath, options) {
  return new Promise((resolve, reject) => {
    cloudinary.uploader.upload_large(filePath, options, (error, result) => {
      if (error) reject(error);
      else resolve(result);
    });
  });
}

router.post("/upload", requireAuth, upload.array("files", 20), async (req, res) => {
  const cleanupTasks = [];

  try {
    if (!req.files || req.files.length === 0) {
      return res.status(400).json({ error: "No files were received" });
    }

    const albumId = req.body.albumId || null;

    const outcomes = await Promise.allSettled(
      req.files.map(async (file) => {
        cleanupTasks.push(file.path);
        const isVideo = file.mimetype.startsWith("video/");

        const options = {
          folder: "my-gallery",
          resource_type: isVideo ? "video" : "image",
          timeout: 300000,
        };

        console.log(
          `Uploading "${file.originalname}" (${isVideo ? "video" : "image"}, ${(file.size / (1024 * 1024)).toFixed(1)}MB)…`
        );

        let result;
        try {
          // Videos go through Cloudinary's chunked upload — it splits the
          // file into pieces and uploads them one at a time, which survives
          // a flaky or slow connection far better than sending the whole
          // file as one long request (which was failing with 502s on
          // Render's free tier).
          result = isVideo
            ? await uploadLargeAsync(file.path, {
                ...options,
                chunk_size: 6 * 1024 * 1024, // 6MB per chunk
              })
            : await cloudinary.uploader.upload(file.path, options);
        } catch (uploadErr) {
          console.error(
            `Cloudinary upload FAILED for "${file.originalname}" (${(file.size / (1024 * 1024)).toFixed(1)}MB, ${file.mimetype}):`,
            describeError(uploadErr)
          );
          throw uploadErr;
        }

        console.log(`Upload succeeded for "${file.originalname}" -> ${result.public_id}`);

        return Media.create({
          user: req.userId,
          album: albumId,
          url: result.secure_url,
          publicId: result.public_id,
          type: isVideo ? "video" : "image",
          originalName: file.originalname,
          bytes: result.bytes,
        });
      })
    );

    const saved = outcomes.filter((o) => o.status === "fulfilled").map((o) => o.value);
    const failedCount = outcomes.length - saved.length;

    if (saved.length === 0) {
      return res.status(500).json({ error: "Upload failed, please try again" });
    }

    res.status(failedCount > 0 ? 207 : 201).json({ media: saved, failedCount });
  } catch (err) {
    logError(err);
    res.status(500).json({ error: "Upload failed, please try again" });
  } finally {
    // Always clean up the temp files, whether the upload succeeded or not.
    cleanupTasks.forEach((filePath) => {
      fs.unlink(filePath, () => {});
    });
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
    logError(err);
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
    logError(err);
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
    logError(err);
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
    logError(err);
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
    logError(err);
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
    logError(err);
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
    logError(err);
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
    logError(err);
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
    logError(err);
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
    logError(err);
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
    logError(err);
    res.status(500).json({ error: "Could not delete this file" });
  }
});

module.exports = router;

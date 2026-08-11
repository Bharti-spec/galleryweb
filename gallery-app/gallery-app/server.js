require("dotenv").config();
const express = require("express");
const cors = require("cors");
const path = require("path");
const connectDB = require("./config/db");

const authRoutes = require("./routes/auth");
const mediaRoutes = require("./routes/media");
const albumRoutes = require("./routes/albums");
const publicRoutes = require("./routes/public");

const app = express();

connectDB();

app.use(cors());
app.use(express.json());

// API routes
app.use("/api/auth", authRoutes);
app.use("/api/media", mediaRoutes);
app.use("/api/albums", albumRoutes);
app.use("/api/public", publicRoutes);

// Serve the frontend
app.use(express.static(path.join(__dirname, "public")));

app.get("/gallery.html", (req, res) => {
  res.sendFile(path.join(__dirname, "public", "gallery.html"));
});

app.get("/", (req, res) => {
  res.sendFile(path.join(__dirname, "public", "index.html"));
});

// Catches errors that happen in middleware BEFORE our own route handlers run
// (e.g. multer / the Cloudinary storage engine failing on an upload) — these
// never reach our routes' own try/catch blocks, and without this Express's
// default handler was logging them as a useless "[object Object]".
function describeError(err) {
  if (!err) return "Unknown error";
  if (err instanceof Error) return err.stack || err.message;
  try {
    return JSON.stringify(err, Object.getOwnPropertyNames(err));
  } catch {
    return String(err);
  }
}

app.use((err, req, res, next) => {
  console.error("Unhandled request error:", describeError(err));
  if (res.headersSent) return next(err);
  res.status(err.status || 500).json({
    error: err.message || "Something went wrong, please try again",
  });
});

// Catches anything that slips past Express entirely (e.g. a rejected
// promise nobody awaited) so the process logs something useful instead of
// crashing silently or printing "[object Object]".
process.on("unhandledRejection", (err) => {
  console.error("Unhandled promise rejection:", describeError(err));
});

const PORT = process.env.PORT || 5000;
app.listen(PORT, () => {
  console.log(`Server running on port ${PORT}`);
});

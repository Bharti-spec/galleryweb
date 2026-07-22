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

const PORT = process.env.PORT || 5000;
app.listen(PORT, () => {
  console.log(`Server running on port ${PORT}`);
});

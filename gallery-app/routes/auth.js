const express = require("express");
const jwt = require("jsonwebtoken");
const User = require("../models/User");

const router = express.Router();

// POST /api/auth/login
// If phone already exists -> log that person in
// If phone is new -> create a new account with the given name
router.post("/login", async (req, res) => {
  try {
    let { name, phone } = req.body;

    if (!name || !phone) {
      return res.status(400).json({ error: "Name and phone number are required" });
    }

    name = name.trim();
    phone = phone.trim();

    if (phone.length < 6) {
      return res.status(400).json({ error: "Please enter a valid phone number" });
    }

    let user = await User.findOne({ phone });

    if (!user) {
      user = await User.create({ name, phone });
    }

    const token = jwt.sign({ userId: user._id }, process.env.JWT_SECRET, {
      expiresIn: "90d",
    });

    res.json({
      token,
      user: { id: user._id, name: user.name, phone: user.phone },
    });
  } catch (err) {
    console.error(err);
    res.status(500).json({ error: "Something went wrong, please try again" });
  }
});

module.exports = router;

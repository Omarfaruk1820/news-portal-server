import express from "express";
import bcrypt from "bcryptjs";
import jwt from "jsonwebtoken";
import { ObjectId } from "mongodb";

import { getDB } from "../config/db.js";
import verifyToken from "../middleware/verifyToken.js";

const router = express.Router();

const USERS_COLLECTION = "users";
const JWT_EXPIRES_IN = "1d";

function createToken(user) {
  const secret = process.env.JWT_SECRET;

  if (!secret || Buffer.byteLength(secret, "utf8") < 32) {
    throw new Error("JWT_SECRET must contain at least 32 bytes.");
  }

  return jwt.sign(
    {
      sub: user._id.toString(),
      role: user.role,
    },
    secret,
    {
      algorithm: "HS256",
      expiresIn: JWT_EXPIRES_IN,
    },
  );
}

function publicUser(user) {
  return {
    id: user._id.toString(),
    name: user.name,
    email: user.email,
    role: user.role,
  };
}

function isValidEmail(email) {
  return email.length <= 254 && /^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email);
}

// POST /api/auth/register
router.post("/register", async (req, res, next) => {
  try {
    const { name, email, password } = req.body || {};

    if (
      typeof name !== "string" ||
      typeof email !== "string" ||
      typeof password !== "string"
    ) {
      return res.status(400).json({
        success: false,
        message: "Name, email, and password are required.",
      });
    }

    const normalizedName = name.trim();
    const normalizedEmail = email.trim().toLowerCase();

    if (normalizedName.length < 2 || normalizedName.length > 80) {
      return res.status(400).json({
        success: false,
        message: "Name must be between 2 and 80 characters.",
      });
    }

    if (!isValidEmail(normalizedEmail)) {
      return res.status(400).json({
        success: false,
        message: "Please provide a valid email address.",
      });
    }

    if (password.length < 8 || password.length > 128) {
      return res.status(400).json({
        success: false,
        message: "Password must be between 8 and 128 characters.",
      });
    }

    const users = getDB().collection(USERS_COLLECTION);

    const existingUser = await users.findOne({
      email: normalizedEmail,
    });

    if (existingUser) {
      return res.status(409).json({
        success: false,
        message: "An account with this email already exists.",
      });
    }

    const passwordHash = await bcrypt.hash(password, 12);
    const now = new Date();

    const newUser = {
      name: normalizedName,
      email: normalizedEmail,
      password: passwordHash,
      role: "user",
      createdAt: now,
      updatedAt: now,
    };

    const result = await users.insertOne(newUser);

    const createdUser = {
      ...newUser,
      _id: result.insertedId,
    };

    return res.status(201).json({
      success: true,
      message: "Registration successful.",
      token: createToken(createdUser),
      user: publicUser(createdUser),
    });
  } catch (error) {
    if (error?.code === 11000) {
      return res.status(409).json({
        success: false,
        message: "An account with this email already exists.",
      });
    }

    return next(error);
  }
});

// POST /api/auth/login
router.post("/login", async (req, res, next) => {
  try {
    const { email, password } = req.body || {};

    if (
      typeof email !== "string" ||
      typeof password !== "string" ||
      !email.trim() ||
      !password ||
      password.length > 128
    ) {
      return res.status(400).json({
        success: false,
        message: "A valid email and password are required.",
      });
    }

    const normalizedEmail = email.trim().toLowerCase();

    if (!isValidEmail(normalizedEmail)) {
      return res.status(400).json({
        success: false,
        message: "Please provide a valid email address.",
      });
    }

    const user = await getDB()
      .collection(USERS_COLLECTION)
      .findOne({ email: normalizedEmail });

    if (
      !user ||
      typeof user.password !== "string" ||
      !(await bcrypt.compare(password, user.password))
    ) {
      return res.status(401).json({
        success: false,
        message: "Invalid email or password.",
      });
    }

    return res.status(200).json({
      success: true,
      message: "Login successful.",
      token: createToken(user),
      user: publicUser(user),
    });
  } catch (error) {
    return next(error);
  }
});

// GET /api/auth/me
router.get("/me", verifyToken, async (req, res, next) => {
  try {
    const user = await getDB()
      .collection(USERS_COLLECTION)
      .findOne(
        { _id: new ObjectId(req.user.id) },
        {
          projection: {
            name: 1,
            email: 1,
            role: 1,
            createdAt: 1,
          },
        },
      );

    if (!user) {
      return res.status(401).json({
        success: false,
        message: "User account was not found.",
      });
    }

    return res.status(200).json({
      success: true,
      user: publicUser(user),
    });
  } catch (error) {
    return next(error);
  }
});

export default router;

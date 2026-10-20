import "dotenv/config";

import express from "express";
import cors from "cors";
import helmet from "helmet";
import rateLimit from "express-rate-limit";

import newsRoutes from "./routes/newsRoutes.js";
import authRoutes from "./routes/authRoutes.js";
import categoryRoutes from "./routes/categoryRoutes.js";

import { connectToMongoDB, disconnectFromMongoDB, getDB } from "./config/db.js";

import { ensureIndexes } from "./config/indexes.js";

const app = express();

const PORT = Number(process.env.PORT || 5000);
const isProduction = process.env.NODE_ENV === "production";

if (!Number.isInteger(PORT) || PORT < 1 || PORT > 65535) {
  throw new Error("PORT must be between 1 and 65535.");
}

if (
  !process.env.JWT_SECRET ||
  Buffer.byteLength(process.env.JWT_SECRET, "utf8") < 32
) {
  throw new Error("JWT_SECRET must contain at least 32 bytes.");
}

// Validate frontend origins.
function normalizeOrigin(value) {
  let parsed;

  try {
    parsed = new URL(value);
  } catch {
    throw new Error(`Invalid CLIENT_URL origin: ${value}`);
  }

  if (
    !["http:", "https:"].includes(parsed.protocol) ||
    parsed.username ||
    parsed.password ||
    parsed.pathname !== "/" ||
    parsed.search ||
    parsed.hash
  ) {
    throw new Error(`CLIENT_URL must contain only an origin: ${value}`);
  }

  return parsed.origin;
}

const configuredOrigins = (process.env.CLIENT_URL || "")
  .split(",")
  .map((origin) => origin.trim())
  .filter(Boolean)
  .map(normalizeOrigin);

if (isProduction && configuredOrigins.length === 0) {
  throw new Error("Set CLIENT_URL to your production frontend origin.");
}

const allowedOrigins = new Set([
  ...(isProduction ? [] : ["http://localhost:5173", "http://127.0.0.1:5173"]),
  ...configuredOrigins,
]);

app.disable("x-powered-by");

app.use(helmet());

app.use(
  cors({
    origin(origin, callback) {
      // CORS is not authentication. Requests without Origin are allowed.
      if (!origin) {
        return callback(null, true);
      }

      let normalizedOrigin;

      try {
        normalizedOrigin = new URL(origin).origin;
      } catch {
        const error = new Error("Invalid request origin.");
        error.status = 403;
        return callback(error);
      }

      if (!allowedOrigins.has(normalizedOrigin)) {
        const error = new Error("Origin is not allowed by CORS.");
        error.status = 403;
        return callback(error);
      }

      return callback(null, true);
    },
    credentials: true,
    methods: ["GET", "POST", "PUT", "PATCH", "DELETE", "OPTIONS"],
    allowedHeaders: ["Content-Type", "Authorization"],
  }),
);

// General API limiter. Auth receives its own limiter.
const apiRateLimiter = rateLimit({
  windowMs: 15 * 60 * 1000,
  limit: 300,
  standardHeaders: "draft-8",
  legacyHeaders: false,
  skip(req) {
    return req.path === "/auth" || req.path.startsWith("/auth/");
  },
  message: {
    success: false,
    message: "অনেক বেশি request করা হয়েছে। কিছুক্ষণ পরে আবার চেষ্টা করুন।",
  },
});

app.use("/api", apiRateLimiter);

app.use(
  "/api/auth",
  rateLimit({
    windowMs: 15 * 60 * 1000,
    limit: 20,
    standardHeaders: "draft-8",
    legacyHeaders: false,
    message: {
      success: false,
      message:
        "অনেক বেশি authentication request করা হয়েছে। পরে আবার চেষ্টা করুন।",
    },
  }),
);

app.use(express.json({ limit: "1mb" }));

app.use(
  express.urlencoded({
    extended: true,
    limit: "1mb",
  }),
);

// Health/readiness check
app.get("/api/health", async (req, res, next) => {
  try {
    await getDB().command({ ping: 1 });

    return res.status(200).json({
      success: true,
      status: "ok",
      database: "connected",
    });
  } catch (error) {
    return next(error);
  }
});

// API routes
app.use("/api/news", newsRoutes);
app.use("/api/auth", authRoutes);
app.use("/api/categories", categoryRoutes);

// Unknown routes
app.use((req, res) => {
  return res.status(404).json({
    success: false,
    message: "Route not found.",
    path: req.path,
    method: req.method,
  });
});

// Global error handler
app.use((err, req, res, next) => {
  if (res.headersSent) {
    return next(err);
  }

  const candidateStatus = err.status ?? err.statusCode;

  let statusCode =
    Number.isInteger(candidateStatus) &&
    candidateStatus >= 400 &&
    candidateStatus <= 599
      ? candidateStatus
      : 500;

  // Malformed JSON from express.json()
  if (err instanceof SyntaxError && "body" in err) {
    statusCode = 400;
  }

  if (statusCode >= 500) {
    console.error("Server error:", err);
  } else if (!isProduction) {
    console.warn("Request error:", err.message);
  }

  const message =
    statusCode >= 500 && isProduction
      ? "Internal server error."
      : statusCode === 400 && err instanceof SyntaxError
        ? "Invalid JSON request body."
        : err.message || "Something went wrong.";

  return res.status(statusCode).json({
    success: false,
    message,
    ...(isProduction ? {} : { stack: err.stack }),
  });
});

let server;
let isShuttingDown = false;

async function startServer() {
  try {
    await connectToMongoDB();
    await ensureIndexes();

    server = app.listen(PORT);

    await new Promise((resolve, reject) => {
      const onListening = () => {
        cleanup();
        resolve();
      };

      const onError = (error) => {
        cleanup();
        reject(error);
      };

      const cleanup = () => {
        server.off("listening", onListening);
        server.off("error", onError);
      };

      server.once("listening", onListening);
      server.once("error", onError);
    });

    server.on("error", (error) => {
      console.error("HTTP server error:", error);
      process.exitCode = 1;
    });

    console.log(`News portal API running on port ${PORT}`);
    console.log(`Health check: http://localhost:${PORT}/api/health`);
  } catch (error) {
    console.error("Server startup failed:", error.message);

    try {
      await disconnectFromMongoDB();
    } catch (closeError) {
      console.error("MongoDB cleanup failed:", closeError.message);
    }

    process.exitCode = 1;
  }
}

async function shutdown(signal) {
  if (isShuttingDown) {
    server?.closeAllConnections();
    return;
  }

  isShuttingDown = true;

  console.log(`${signal} received. Shutting down...`);

  const forceShutdownTimer = setTimeout(() => {
    console.error("Shutdown timed out. Closing open connections.");
    server?.closeAllConnections();
    process.exit(1);
  }, 15000);

  forceShutdownTimer.unref();

  try {
    if (server) {
      await new Promise((resolve, reject) => {
        server.close((error) => {
          if (error) reject(error);
          else resolve();
        });
      });
    }

    await disconnectFromMongoDB();

    clearTimeout(forceShutdownTimer);
    console.log("Server shutdown completed.");
  } catch (error) {
    clearTimeout(forceShutdownTimer);
    console.error("Shutdown failed:", error.message);
    process.exitCode = 1;
  }
}

process.once("SIGINT", () => {
  void shutdown("SIGINT");
});

process.once("SIGTERM", () => {
  void shutdown("SIGTERM");
});

void startServer();

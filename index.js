import "dotenv/config";

import express from "express";
import cors from "cors";
import helmet from "helmet";
import rateLimit from "express-rate-limit";

import newsRoutes from "./routes/newsRoutes.js";
import authRoutes from "./routes/authRoutes.js";
import categoryRoutes from "./routes/categoryRoutes.js";

import { connectToMongoDB, disconnectFromMongoDB, getDB } from "./config/db.js";

const app = express();

const PORT = Number(process.env.PORT || 5000);
const isProduction = process.env.NODE_ENV === "production";

// --------------------------------------------------
// 1. Validate server configuration
// --------------------------------------------------

if (!Number.isInteger(PORT) || PORT < 1 || PORT > 65535) {
  throw new Error("PORT must be a valid port between 1 and 65535.");
}

function normalizeOrigin(value) {
  let parsedUrl;

  try {
    parsedUrl = new URL(value);
  } catch {
    throw new Error(`Invalid CLIENT_URL origin: ${value}`);
  }

  if (
    !["http:", "https:"].includes(parsedUrl.protocol) ||
    parsedUrl.username ||
    parsedUrl.password ||
    parsedUrl.pathname !== "/" ||
    parsedUrl.search ||
    parsedUrl.hash
  ) {
    throw new Error(
      `CLIENT_URL must contain only an origin, such as https://example.com. Invalid value: ${value}`,
    );
  }

  return parsedUrl.origin;
}

const configuredOrigins = (process.env.CLIENT_URL || "")
  .split(",")
  .map((origin) => origin.trim())
  .filter(Boolean)
  .map(normalizeOrigin);

if (isProduction && configuredOrigins.length === 0) {
  throw new Error(
    "CLIENT_URL must contain at least one frontend origin in production.",
  );
}

const allowedOrigins = new Set([
  ...(isProduction ? [] : ["http://localhost:5173", "http://127.0.0.1:5173"]),
  ...configuredOrigins,
]);

// --------------------------------------------------
// 2. Security middleware
// --------------------------------------------------

app.disable("x-powered-by");

app.use(helmet());

app.use(
  cors({
    origin(origin, callback) {
      // Requests without an Origin header include server-to-server
      // and command-line requests. CORS does not authenticate them.
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

      if (allowedOrigins.has(normalizedOrigin)) {
        return callback(null, true);
      }

      const error = new Error("Origin is not allowed by CORS.");
      error.status = 403;

      return callback(error);
    },
    credentials: true,
    methods: ["GET", "POST", "PUT", "PATCH", "DELETE", "OPTIONS"],
    allowedHeaders: ["Content-Type", "Authorization"],
  }),
);

// --------------------------------------------------
// 3. General API rate limiter
// --------------------------------------------------

const apiRateLimiter = rateLimit({
  windowMs: 15 * 60 * 1000,
  limit: 300,
  standardHeaders: "draft-8",
  legacyHeaders: false,

  // Auth has its own stricter limiter below.
  skip(req) {
    const path = req.originalUrl.split("?")[0];
    return path === "/api/auth" || path.startsWith("/api/auth/");
  },

  message: {
    success: false,
    message: "অনেক বেশি request করা হয়েছে। কিছুক্ষণ পরে আবার চেষ্টা করুন।",
  },
});

app.use("/api", apiRateLimiter);

// --------------------------------------------------
// 4. Authentication rate limiter
// --------------------------------------------------

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

// --------------------------------------------------
// 5. Request parsing
// --------------------------------------------------

app.use(express.json({ limit: "1mb" }));

app.use(
  express.urlencoded({
    extended: true,
    limit: "1mb",
  }),
);

// --------------------------------------------------
// 6. Health / readiness check
// --------------------------------------------------

// This endpoint verifies that the API can reach MongoDB.
// Returns 503 if the database is not ready.
app.get("/api/health", async (req, res) => {
  try {
    await getDB().command({ ping: 1 });

    return res.status(200).json({
      success: true,
      status: "ok",
      database: "connected",
    });
  } catch (error) {
    console.error("Health check failed:", error.message);

    return res.status(503).json({
      success: false,
      status: "unavailable",
      database: "disconnected",
    });
  }
});

// --------------------------------------------------
// 7. API routes
// --------------------------------------------------

app.use("/api/news", newsRoutes);
app.use("/api/auth", authRoutes);
app.use("/api/categories", categoryRoutes);

// --------------------------------------------------
// 8. Not found handler
// --------------------------------------------------

app.use((req, res) => {
  return res.status(404).json({
    success: false,
    message: "Route not found.",
    path: req.path,
    method: req.method,
  });
});

// --------------------------------------------------
// 9. Global error handler
// --------------------------------------------------

app.use((err, req, res, next) => {
  if (res.headersSent) {
    return next(err);
  }

  const candidateStatus = err.status ?? err.statusCode;

  const statusCode =
    Number.isInteger(candidateStatus) &&
    candidateStatus >= 400 &&
    candidateStatus <= 599
      ? candidateStatus
      : 500;

  if (statusCode >= 500) {
    console.error("Server error:", err);
  }

  const message =
    statusCode >= 500 && isProduction
      ? "Internal server error."
      : err.message || "Something went wrong.";

  return res.status(statusCode).json({
    success: false,
    message,
    ...(isProduction ? {} : { stack: err.stack }),
  });
});

// --------------------------------------------------
// 10. Start server after MongoDB connects
// --------------------------------------------------

let server;
let isShuttingDown = false;

async function startServer() {
  try {
    await connectToMongoDB();

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

    // Handle HTTP server errors occurring after startup.
    server.on("error", (error) => {
      console.error("HTTP server error:", error);
      process.exitCode = 1;
    });

    console.log(`News portal server is running on port ${PORT}`);
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

// --------------------------------------------------
// 11. Graceful shutdown
// --------------------------------------------------

async function shutdown(signal) {
  if (isShuttingDown) {
    console.warn("Shutdown already in progress.");

    // A repeated signal means force-close active HTTP connections.
    server?.closeAllConnections();

    return;
  }

  isShuttingDown = true;

  console.log(`${signal} received. Shutting down gracefully...`);

  // Avoid waiting forever for stuck requests.
  const forceShutdownTimer = setTimeout(() => {
    console.error("Shutdown timed out. Closing remaining connections.");

    server?.closeAllConnections();
    process.exit(1);
  }, 15000);

  try {
    if (server) {
      // Stop accepting new connections and wait for active requests.
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

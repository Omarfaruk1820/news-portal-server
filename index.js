import "dotenv/config";

import express from "express";
import cors from "cors";
import helmet from "helmet";
import rateLimit from "express-rate-limit";

import newsRoutes from "./routes/newsRoutes.js";
import authRoutes from "./routes/authRoutes.js";
import categoryRoutes from "./routes/categoryRoutes.js";

import { connectToMongoDB, disconnectFromMongoDB } from "./config/db.js";

const app = express();

const PORT = Number(process.env.PORT || 5000);
const isProduction = process.env.NODE_ENV === "production";

// --------------------------------------------------
// 1. Validate configuration
// --------------------------------------------------

if (!Number.isInteger(PORT) || PORT < 1 || PORT > 65535) {
  throw new Error("PORT must be a valid port between 1 and 65535.");
}

const configuredOrigins = (process.env.CLIENT_URL || "")
  .split(",")
  .map((origin) => origin.trim().replace(/\/+$/, ""))
  .filter(Boolean);

if (isProduction && configuredOrigins.length === 0) {
  throw new Error(
    "CLIENT_URL must contain your frontend origin in production.",
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
      if (!origin || allowedOrigins.has(origin.replace(/\/+$/, ""))) {
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
// 3. Request parsing
// --------------------------------------------------

app.use(express.json({ limit: "1mb" }));

app.use(
  express.urlencoded({
    extended: true,
    limit: "1mb",
  }),
);

// --------------------------------------------------
// 4. General API rate limiter
// --------------------------------------------------

app.use(
  "/api",
  rateLimit({
    windowMs: 15 * 60 * 1000,
    limit: 300,
    standardHeaders: true,
    legacyHeaders: false,
    message: {
      success: false,
      message: "অনেক বেশি request করা হয়েছে। কিছুক্ষণ পরে আবার চেষ্টা করুন।",
    },
  }),
);

// --------------------------------------------------
// 5. Authentication rate limiter
// --------------------------------------------------

app.use(
  "/api/auth",
  rateLimit({
    windowMs: 15 * 60 * 1000,
    limit: 20,
    standardHeaders: true,
    legacyHeaders: false,
    message: {
      success: false,
      message:
        "অনেক বেশি authentication request করা হয়েছে। পরে আবার চেষ্টা করুন।",
    },
  }),
);

// --------------------------------------------------
// 6. Health check
// --------------------------------------------------

app.get("/api/health", (req, res) => {
  res.status(200).json({
    success: true,
    message: "API is running",
    ...(isProduction
      ? {}
      : { environment: process.env.NODE_ENV || "development" }),
  });
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
  res.status(404).json({
    success: false,
    message: "Route not found",
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

  res.status(statusCode).json({
    success: false,
    message:
      statusCode >= 500 && isProduction
        ? "Internal server error"
        : err.message || "Something went wrong",
    ...(!isProduction ? { stack: err.stack } : {}),
  });
});

// --------------------------------------------------
// 10. Start server only after MongoDB connects
// --------------------------------------------------

let server;
let isShuttingDown = false;

async function startServer() {
  try {
    await connectToMongoDB();

    server = await new Promise((resolve, reject) => {
      const httpServer = app.listen(PORT);

      httpServer.once("listening", () => {
        resolve(httpServer);
      });

      httpServer.once("error", reject);
    });

    console.log(`News portal server is running on port ${PORT}`);
    console.log(`Health check: http://localhost:${PORT}/api/health`);

    server.on("error", (error) => {
      console.error("HTTP server error:", error);
      process.exitCode = 1;
    });
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
    return;
  }

  isShuttingDown = true;
  console.log(`${signal} received. Shutting down...`);

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
    console.log("Server shutdown completed.");
  } catch (error) {
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

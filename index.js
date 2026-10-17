// index.js

// Load environment variables from .env
import "dotenv/config";

import express from "express";
import cors from "cors";
import helmet from "helmet";
import rateLimit from "express-rate-limit";

// import newsRoutes from "./routes/newsRoutes.js";
// import authRoutes from "./routes/authRoutes.js";
// import categoryRoutes from "./routes/categoryRoutes.js";

const app = express();

const isProduction = process.env.NODE_ENV === "production";
const PORT = process.env.PORT || 5000;

// --------------------------------------------------
// 1. CORS configuration
// --------------------------------------------------

const configuredOrigins = (process.env.CLIENT_URL || "")
  .split(",")
  .map((origin) => origin.trim())
  .filter(Boolean);

const allowedOrigins = isProduction
  ? configuredOrigins
  : ["http://localhost:5173", "http://127.0.0.1:5173", ...configuredOrigins];

if (isProduction && allowedOrigins.length === 0) {
  throw new Error(
    "CLIENT_URL must be configured with your frontend origin in production.",
  );
}

// --------------------------------------------------
// 2. Security middleware
// --------------------------------------------------

app.use(helmet());

app.use(
  cors({
    origin: (origin, callback) => {
      // Allow requests without an Origin header, such as server-to-server calls.
      if (!origin || allowedOrigins.includes(origin)) {
        return callback(null, true);
      }

      const corsError = new Error("Origin is not allowed by CORS.");
      corsError.status = 403;

      return callback(corsError);
    },
    credentials: true,
    methods: ["GET", "POST", "PUT", "PATCH", "DELETE", "OPTIONS"],
    allowedHeaders: ["Content-Type", "Authorization"],
  }),
);

// --------------------------------------------------
// 3. Request body parsing
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

const apiLimiter = rateLimit({
  windowMs: 15 * 60 * 1000,
  limit: 300,
  standardHeaders: true,
  legacyHeaders: false,
  message: {
    success: false,
    message: "অনেক বেশি request করা হয়েছে। কিছুক্ষণ পরে আবার চেষ্টা করুন।",
  },
});

app.use("/api", apiLimiter);

// --------------------------------------------------
// 5. Authentication rate limiter
// --------------------------------------------------

const authLimiter = rateLimit({
  windowMs: 15 * 60 * 1000,
  limit: 20,
  standardHeaders: true,
  legacyHeaders: false,
  message: {
    success: false,
    message:
      "অনেক বেশি authentication request করা হয়েছে। ১৫ মিনিট পরে আবার চেষ্টা করুন।",
  },
});

app.use("/api/auth", authLimiter);

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

// app.use("/api/news", newsRoutes);
// app.use("/api/auth", authRoutes);
// app.use("/api/categories", categoryRoutes);

// --------------------------------------------------
// 8. Not found handler
// Keep this after all routes.
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
// Keep this as the final middleware.
// --------------------------------------------------

app.use((err, req, res, next) => {
  if (res.headersSent) {
    return next(err);
  }

  const statusCode = err.status || err.statusCode || 500;

  // Avoid exposing internal error details in production.
  const message =
    statusCode >= 500 && isProduction
      ? "Internal server error"
      : err.message || "Something went wrong";

  if (statusCode >= 500) {
    console.error("Server error:", err);
  }

  res.status(statusCode).json({
    success: false,
    message,
    ...(isProduction ? {} : { stack: err.stack }),
  });
});

// --------------------------------------------------
// 10. Start the server
// --------------------------------------------------

app.listen(PORT, () => {
  console.log(`News portal server is running on port ${PORT}`);
});

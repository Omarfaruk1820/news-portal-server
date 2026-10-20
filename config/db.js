import "dotenv/config";
import { MongoClient } from "mongodb";

// --------------------------------------------------
// 1. MongoDB configuration
// --------------------------------------------------

const CLUSTER_HOST = "cluster0.g29mryf.mongodb.net";
const DATABASE_NAME = process.env.DB_NAME?.trim();
const DB_USER = process.env.DB_USER?.trim();
const DB_PASS = process.env.DB_PASS;

if (!DATABASE_NAME || !DB_USER || !DB_PASS) {
  throw new Error(
    "MongoDB configuration error: DB_NAME, DB_USER, and DB_PASS must be set in the backend .env file.",
  );
}

// Keep the cluster hostname and MongoDB URI inside this file.
// Encode credentials to support special characters in username/password.
const MONGODB_CLUSTER_HOST = CLUSTER_HOST;

const MONGODB_URI =
  `mongodb+srv://${encodeURIComponent(DB_USER)}:` +
  `${encodeURIComponent(DB_PASS)}@${MONGODB_CLUSTER_HOST}/` +
  `?retryWrites=true&w=majority&appName=NewsPortal`;

// --------------------------------------------------
// 2. MongoDB client
// --------------------------------------------------

const client = new MongoClient(MONGODB_URI, {
  connectTimeoutMS: 10000,
  serverSelectionTimeoutMS: 10000,
  maxPoolSize: 20,
  minPoolSize: 0,
  retryReads: true,
  retryWrites: true,
});

let database = null;
let connectionPromise = null;
let isClosing = false;

// --------------------------------------------------
// 3. Connect to MongoDB
// --------------------------------------------------

export async function connectToMongoDB() {
  if (isClosing) {
    throw new Error("MongoDB client is shutting down.");
  }

  if (database) {
    return database;
  }

  // Reuse an ongoing connection attempt.
  if (connectionPromise) {
    return connectionPromise;
  }

  connectionPromise = (async () => {
    try {
      await client.connect();

      const db = client.db(DATABASE_NAME);

      // Verify that MongoDB responds.
      await db.command({ ping: 1 });

      database = db;

      console.log(`MongoDB connected. Database: ${DATABASE_NAME}`);

      return database;
    } catch (error) {
      console.error("MongoDB connection failed:", error.message);

      // Close a partially established client before retrying.
      try {
        await client.close();
      } catch {
        // Preserve the original connection error.
      }

      throw error;
    } finally {
      connectionPromise = null;
    }
  })();

  return connectionPromise;
}

// --------------------------------------------------
// 4. Get the connected database
// --------------------------------------------------

export function getDB() {
  if (!database || isClosing) {
    throw new Error(
      "MongoDB is not connected. Call connectToMongoDB() before getDB().",
    );
  }

  return database;
}

// --------------------------------------------------
// 5. Graceful shutdown
// --------------------------------------------------

export async function disconnectFromMongoDB() {
  if (isClosing) {
    return;
  }

  isClosing = true;

  try {
    // Wait for any active connection attempt.
    if (connectionPromise) {
      try {
        await connectionPromise;
      } catch {
        // The connection failure was already logged.
      }
    }

    await client.close();
    database = null;

    console.log("MongoDB connection closed.");
  } catch (error) {
    console.error("MongoDB shutdown error:", error.message);
    throw error;
  } finally {
    database = null;
    connectionPromise = null;
  }
}

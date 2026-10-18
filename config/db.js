import "dotenv/config";
import { MongoClient } from "mongodb";

// --------------------------------------------------
// 1. MongoDB configuration
// --------------------------------------------------

// Atlas cluster hostname: এখানে শুধু hostname লিখবেন।
// আপনার Atlas cluster-এর hostname আলাদা হলে সেটি বসান।
const clusterHost = "cluster0.g29mryf.mongodb.net";

const dbUser = process.env.DB_USER?.trim();
const dbPass = process.env.DB_PASS;
const databaseName = process.env.DB_NAME?.trim();

if (!dbUser || !dbPass || !databaseName) {
  throw new Error(
    "DB_USER, DB_PASS, and DB_NAME must be configured in the backend .env file.",
  );
}

const mongoUri =
  `mongodb+srv://${encodeURIComponent(dbUser)}:` +
  `${encodeURIComponent(dbPass)}@${clusterHost}/` +
  `?retryWrites=true&w=majority`;

// --------------------------------------------------
// 2. MongoDB client
// --------------------------------------------------

const client = new MongoClient(mongoUri, {
  connectTimeoutMS: 10000,
  serverSelectionTimeoutMS: 10000,
  maxPoolSize: 20,
});

let database = null;
let connectionPromise = null;
let isClosing = false;

// --------------------------------------------------
// 3. Connect and reuse the database
// --------------------------------------------------

export async function connectToMongoDB() {
  if (isClosing) {
    throw new Error("MongoDB client is shutting down.");
  }

  if (database) {
    return database;
  }

  // Prevent simultaneous duplicate connection attempts.
  if (connectionPromise) {
    return connectionPromise;
  }

  connectionPromise = (async () => {
    try {
      await client.connect();

      const db = client.db(databaseName);

      // Confirm that the database connection is working.
      await db.command({ ping: 1 });

      database = db;

      console.log(`MongoDB connected. Database: ${databaseName}`);

      return database;
    } catch (error) {
      console.error("MongoDB connection failed:", error.message);
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
    // Wait for an in-progress connection attempt to finish.
    if (connectionPromise) {
      try {
        await connectionPromise;
      } catch {
        // The connection error was already logged.
      }
    }

    await client.close();
    database = null;

    console.log("MongoDB connection closed.");
  } finally {
    database = null;
    connectionPromise = null;
  }
}

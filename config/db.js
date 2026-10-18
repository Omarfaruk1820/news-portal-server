// config/db.js

import "dotenv/config";
import { MongoClient } from "mongodb";

const mongoUri = process.env.MONGODB_URI;
const databaseName = process.env.DB_NAME;

if (!mongoUri) {
  throw new Error("MONGODB_URI is missing from your .env file.");
}

if (!databaseName) {
  throw new Error("DB_NAME is missing from your .env file.");
}

const client = new MongoClient(mongoUri);

let database;

// Connect to MongoDB once during application startup.
export async function connectToMongoDB() {
  try {
    await client.connect();

    database = client.db(databaseName);

    // Verify the connection with a ping.
    await database.command({ ping: 1 });

    console.log("MongoDB connected successfully.");

    return database;
  } catch (error) {
    console.error("MongoDB connection failed:", error.message);
    throw error;
  }
}

// Return the connected database to routes and other modules.
export function getDB() {
  if (!database) {
    throw new Error(
      "Database is not connected. Call connectToMongoDB() before using getDB().",
    );
  }

  return database;
}

// Close MongoDB connection when shutting down.
export async function disconnectFromMongoDB() {
  await client.close();
  database = undefined;

  console.log("MongoDB connection closed.");
}

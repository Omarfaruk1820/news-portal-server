import { getDB } from "./db.js";

export async function ensureIndexes() {
  const db = getDB();

  await db.collection("users").createIndex(
    { email: 1 },
    {
      unique: true,
      name: "users_email_unique",
    },
  );

  const news = db.collection("news");

  await Promise.all([
    news.createIndex(
      { status: 1, publishedAt: -1, _id: -1 },
      { name: "news_published_date" },
    ),
    news.createIndex(
      { status: 1, category: 1, publishedAt: -1, _id: -1 },
      { name: "news_category_date" },
    ),
    news.createIndex(
      { status: 1, featured: 1, publishedAt: -1, _id: -1 },
      { name: "news_featured_date" },
    ),
    news.createIndex({ slug: 1 }, { name: "news_slug_lookup" }),
  ]);

  console.log("MongoDB indexes are ready.");
}

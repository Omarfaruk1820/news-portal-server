import express from "express";
import { getDB } from "../config/db.js";

const router = express.Router();

const NEWS_COLLECTION = "news";

// GET /api/categories
// Return categories with published article counts.
router.get("/", async (req, res, next) => {
  try {
    const db = getDB();

    const categories = await db
      .collection(NEWS_COLLECTION)
      .aggregate([
        {
          $match: {
            status: "published",
          },
        },
        {
          $group: {
            _id: "$category",
            newsCount: { $sum: 1 },
          },
        },
        {
          $project: {
            _id: 0,
            name: "$_id",
            newsCount: 1,
          },
        },
        {
          $sort: {
            name: 1,
          },
        },
      ])
      .toArray();

    return res.status(200).json({
      success: true,
      count: categories.length,
      data: categories,
    });
  } catch (error) {
    return next(error);
  }
});

// GET /api/categories/:category
// Return published news for a specific category.
router.get("/:category", async (req, res, next) => {
  try {
    const category = req.params.category.trim();

    if (!category || category.length > 80) {
      return res.status(400).json({
        success: false,
        message: "Invalid category name.",
      });
    }

    const page = Number(req.query.page ?? 1);
    const limit = Number(req.query.limit ?? 10);

    if (
      !Number.isSafeInteger(page) ||
      page < 1 ||
      !Number.isSafeInteger(limit) ||
      limit < 1 ||
      limit > 50
    ) {
      return res.status(400).json({
        success: false,
        message: "Page must be positive and limit must be between 1 and 50.",
      });
    }

    const db = getDB();
    const newsCollection = db.collection(NEWS_COLLECTION);

    // Assumes the news documents store category as a string.
    const filter = {
      status: "published",
      category: {
        $regex: `^${category.replace(/[.*+?^${}()|[\]\\]/g, "\\$&")}$`,
        $options: "i",
      },
    };

    const [news, total] = await Promise.all([
      newsCollection
        .find(filter)
        .project({
          title: 1,
          slug: 1,
          category: 1,
          excerpt: 1,
          image: 1,
          author: 1,
          publishedAt: 1,
          createdAt: 1,
        })
        .sort({ publishedAt: -1, _id: -1 })
        .skip((page - 1) * limit)
        .limit(limit)
        .toArray(),

      newsCollection.countDocuments(filter),
    ]);

    return res.status(200).json({
      success: true,
      category,
      pagination: {
        page,
        limit,
        total,
        totalPages: Math.ceil(total / limit),
      },
      data: news,
    });
  } catch (error) {
    return next(error);
  }
});

export default router;

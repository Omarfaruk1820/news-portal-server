import express from "express";
import { getDB } from "../config/db.js";

const router = express.Router();

const NEWS_COLLECTION = "news";
const DEFAULT_LIMIT = 10;
const MAX_LIMIT = 50;

const CATEGORY_NEWS_PROJECTION = {
  title: 1,
  slug: 1,
  category: 1,
  excerpt: 1,
  image: 1,
  author: 1,
  publishedAt: 1,
  createdAt: 1,
};

const escapeRegex = (value) => value.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");

const parsePagination = (query) => {
  const page = Number(query.page ?? 1);
  const limit = Number(query.limit ?? DEFAULT_LIMIT);

  if (
    !Number.isSafeInteger(page) ||
    page < 1 ||
    !Number.isSafeInteger(limit) ||
    limit < 1 ||
    limit > MAX_LIMIT
  ) {
    return null;
  }

  const skip = (page - 1) * limit;

  if (!Number.isSafeInteger(skip)) {
    return null;
  }

  return { page, limit, skip };
};

const getNewsCollection = () => getDB().collection(NEWS_COLLECTION);

// GET /api/categories
// Derive categories and counts from published news documents.
router.get("/", async (req, res, next) => {
  try {
    const categories = await getNewsCollection()
      .aggregate([
        {
          $match: {
            status: "published",
            category: {
              $type: "string",
              $ne: "",
            },
          },
        },
        {
          $group: {
            _id: {
              $trim: {
                input: "$category",
              },
            },
            newsCount: {
              $sum: 1,
            },
          },
        },
        {
          $match: {
            _id: {
              $ne: "",
            },
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

// GET /api/categories/:category?page=1&limit=10
router.get("/:category", async (req, res, next) => {
  try {
    const category = req.params.category.trim();

    if (!category || category.length > 80) {
      return res.status(400).json({
        success: false,
        message: "Invalid category name.",
      });
    }

    const pagination = parsePagination(req.query);

    if (!pagination) {
      return res.status(400).json({
        success: false,
        message: `Page must be positive. Limit must be between 1 and ${MAX_LIMIT}.`,
      });
    }

    const filter = {
      status: "published",
      category: {
        $regex: `^${escapeRegex(category)}$`,
        $options: "i",
      },
    };

    const collection = getNewsCollection();
    const { page, limit, skip } = pagination;

    const [news, total] = await Promise.all([
      collection
        .find(filter)
        .project(CATEGORY_NEWS_PROJECTION)
        .sort({ publishedAt: -1, _id: -1 })
        .skip(skip)
        .limit(limit)
        .toArray(),

      collection.countDocuments(filter),
    ]);

    return res.status(200).json({
      success: true,
      category,
      pagination: {
        page,
        limit,
        total,
        totalPages: Math.ceil(total / limit),
        hasNextPage: page * limit < total,
        hasPreviousPage: page > 1,
      },
      data: news,
    });
  } catch (error) {
    return next(error);
  }
});

export default router;

import express from "express";

import { getDB } from "../config/db.js";
import {
  CATEGORY_SLUGS,
  resolveCategoryName,
  getCategorySlug,
} from "../config/categories.js";

const router = express.Router();

const DEFAULT_LIMIT = 12;
const MAX_LIMIT = 50;
const MAX_PAGE = 1000000;

const PUBLIC_NEWS_PROJECTION = {
  _id: 1,
  title: 1,
  slug: 1,
  category: 1,
  excerpt: 1,
  image: 1,
  author: 1,
  tags: 1,
  publishedAt: 1,
  createdAt: 1,
  featured: 1,
};

function parsePositiveInteger(value, fallback, maximum) {
  if (value === undefined || value === "") {
    return fallback;
  }

  if (typeof value !== "string" || !/^\d+$/.test(value)) {
    return null;
  }

  const parsed = Number(value);

  if (!Number.isSafeInteger(parsed) || parsed < 1 || parsed > maximum) {
    return null;
  }

  return parsed;
}

function getPublishedNewsCollection() {
  return getDB().collection("news");
}

// GET /api/categories
router.get("/", async (req, res, next) => {
  try {
    const rows = await getPublishedNewsCollection()
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
          $project: {
            category: {
              $trim: { input: "$category" },
            },
          },
        },
        {
          $match: {
            category: { $ne: "" },
          },
        },
        {
          $group: {
            _id: { $toLower: "$category" },
            name: { $first: "$category" },
            articleCount: { $sum: 1 },
          },
        },
        {
          $sort: { name: 1 },
        },
        {
          $project: {
            _id: 0,
            name: 1,
            articleCount: 1,
          },
        },
      ])
      .toArray();

    const data = rows.map((item) => ({
      ...item,
      slug: getCategorySlug(item.name),
    }));

    // Include configured categories with zero articles if useful to the UI.
    // Existing categories from MongoDB retain their actual article counts.
    const existingSlugs = new Set(data.map((item) => item.slug));

    for (const [slug, name] of Object.entries(CATEGORY_SLUGS)) {
      if (!existingSlugs.has(slug)) {
        data.push({
          name,
          slug,
          articleCount: 0,
        });
      }
    }

    data.sort((a, b) => a.name.localeCompare(b.name, "bn"));

    return res.status(200).json({
      success: true,
      count: data.length,
      data,
    });
  } catch (error) {
    return next(error);
  }
});

// GET /api/categories/national?page=1&limit=12
// Also accepts Bengali category names, e.g. /api/categories/জাতীয়
router.get("/:category", async (req, res, next) => {
  try {
    const categoryName = resolveCategoryName(req.params.category);

    if (!categoryName) {
      return res.status(400).json({
        success: false,
        message: "A valid category is required.",
      });
    }

    const page = parsePositiveInteger(req.query.page, 1, MAX_PAGE);

    const limit = parsePositiveInteger(
      req.query.limit,
      DEFAULT_LIMIT,
      MAX_LIMIT,
    );

    if (page === null || limit === null) {
      return res.status(400).json({
        success: false,
        message: `Page must be between 1 and ${MAX_PAGE}; limit must be between 1 and ${MAX_LIMIT}.`,
      });
    }

    const skip = (page - 1) * limit;

    if (!Number.isSafeInteger(skip)) {
      return res.status(400).json({
        success: false,
        message: "Invalid pagination parameters.",
      });
    }

    const categoryPattern = new RegExp(
      `^\\s*${categoryName.replace(/[.*+?^${}()|[\]\\]/g, "\\$&")}\\s*$`,
      "i",
    );

    const filter = {
      status: "published",
      category: categoryPattern,
    };

    const collection = getPublishedNewsCollection();

    const [articles, totalArticles] = await Promise.all([
      collection
        .find(filter)
        .project(PUBLIC_NEWS_PROJECTION)
        .sort({ publishedAt: -1, _id: -1 })
        .skip(skip)
        .limit(limit)
        .toArray(),
      collection.countDocuments(filter),
    ]);

    const totalPages = Math.ceil(totalArticles / limit);

    return res.status(200).json({
      success: true,
      category: categoryName,
      count: articles.length,
      pagination: {
        page,
        limit,
        totalArticles,
        totalPages,
        hasNextPage: page < totalPages,
        hasPreviousPage: page > 1,
      },
      data: articles,
    });
  } catch (error) {
    return next(error);
  }
});

export default router;

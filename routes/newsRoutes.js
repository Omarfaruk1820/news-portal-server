import express from "express";
import { ObjectId } from "mongodb";

import { getDB } from "../config/db.js";
import { resolveCategoryName } from "../config/categories.js";

const router = express.Router();

const NEWS_COLLECTION = "news";
const DEFAULT_LIMIT = 10;
const MAX_LIMIT = 50;
const MAX_PAGE = 1000000;
const MAX_SEARCH_LENGTH = 100;
const MAX_IDENTIFIER_LENGTH = 200;

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
  views: 1,
  trendingScore: 1,
};

const ARTICLE_PROJECTION = {
  ...PUBLIC_NEWS_PROJECTION,
  content: 1,
  sourceUrl: 1,
  updatedAt: 1,
};

const getNewsCollection = () => getDB().collection(NEWS_COLLECTION);

const publishedFilter = () => ({
  status: "published",
});

function escapeRegex(value) {
  return value.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
}

function parsePagination(query, defaultLimit = DEFAULT_LIMIT) {
  const rawPage = query.page ?? "1";
  const rawLimit = query.limit ?? String(defaultLimit);

  if (
    typeof rawPage !== "string" ||
    typeof rawLimit !== "string" ||
    !/^\d+$/.test(rawPage) ||
    !/^\d+$/.test(rawLimit)
  ) {
    return null;
  }

  const page = Number(rawPage);
  const limit = Number(rawLimit);

  if (
    !Number.isSafeInteger(page) ||
    page < 1 ||
    page > MAX_PAGE ||
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
}

function sendPaginatedNews(res, { page, limit, total, news }) {
  return res.status(200).json({
    success: true,
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
}

function resolveCategoryFilter(categoryInput) {
  if (
    typeof categoryInput !== "string" ||
    !categoryInput.trim() ||
    categoryInput.trim().length > 100
  ) {
    return null;
  }

  const categoryName = resolveCategoryName(categoryInput.trim());

  if (!categoryName || typeof categoryName !== "string") {
    return null;
  }

  return {
    $regex: `^\\s*${escapeRegex(categoryName.trim())}\\s*$`,
    $options: "i",
  };
}

function buildPublishedDate(article) {
  return article.publishedAt || article.createdAt || null;
}

// GET /api/news
// GET /api/news?category=education
// GET /api/news?category=শিক্ষা&page=1&limit=10
router.get("/", async (req, res, next) => {
  try {
    const pagination = parsePagination(req.query);

    if (!pagination) {
      return res.status(400).json({
        success: false,
        message: `Invalid pagination. Page must be 1-${MAX_PAGE} and limit must be 1-${MAX_LIMIT}.`,
      });
    }

    const filter = publishedFilter();

    if (req.query.category !== undefined) {
      const categoryFilter = resolveCategoryFilter(req.query.category);

      if (!categoryFilter) {
        return res.status(400).json({
          success: false,
          message: "A valid category name or slug is required.",
        });
      }

      filter.category = categoryFilter;
    }

    const collection = getNewsCollection();
    const { page, limit, skip } = pagination;

    const [news, total] = await Promise.all([
      collection
        .find(filter)
        .project(PUBLIC_NEWS_PROJECTION)
        .sort({ publishedAt: -1, _id: -1 })
        .skip(skip)
        .limit(limit)
        .toArray(),

      collection.countDocuments(filter),
    ]);

    return sendPaginatedNews(res, {
      page,
      limit,
      total,
      news,
    });
  } catch (error) {
    return next(error);
  }
});

// GET /api/news/latest?limit=10
router.get("/latest", async (req, res, next) => {
  try {
    const pagination = parsePagination(
      { limit: req.query.limit },
      DEFAULT_LIMIT,
    );

    if (!pagination) {
      return res.status(400).json({
        success: false,
        message: `Limit must be between 1 and ${MAX_LIMIT}.`,
      });
    }

    const news = await getNewsCollection()
      .find(publishedFilter())
      .project(PUBLIC_NEWS_PROJECTION)
      .sort({ publishedAt: -1, _id: -1 })
      .limit(pagination.limit)
      .toArray();

    return res.status(200).json({
      success: true,
      count: news.length,
      data: news,
    });
  } catch (error) {
    return next(error);
  }
});

// GET /api/news/featured?limit=5
router.get("/featured", async (req, res, next) => {
  try {
    const pagination = parsePagination({ limit: req.query.limit }, 5);

    if (!pagination) {
      return res.status(400).json({
        success: false,
        message: `Limit must be between 1 and ${MAX_LIMIT}.`,
      });
    }

    const news = await getNewsCollection()
      .find({
        ...publishedFilter(),
        featured: true,
      })
      .project(PUBLIC_NEWS_PROJECTION)
      .sort({ publishedAt: -1, _id: -1 })
      .limit(pagination.limit)
      .toArray();

    return res.status(200).json({
      success: true,
      count: news.length,
      data: news,
    });
  } catch (error) {
    return next(error);
  }
});

// GET /api/news/popular?limit=10
router.get("/popular", async (req, res, next) => {
  try {
    const pagination = parsePagination(
      { limit: req.query.limit },
      DEFAULT_LIMIT,
    );

    if (!pagination) {
      return res.status(400).json({
        success: false,
        message: `Limit must be between 1 and ${MAX_LIMIT}.`,
      });
    }

    const news = await getNewsCollection()
      .find(publishedFilter())
      .project(PUBLIC_NEWS_PROJECTION)
      .sort({
        views: -1,
        publishedAt: -1,
        _id: -1,
      })
      .limit(pagination.limit)
      .toArray();

    return res.status(200).json({
      success: true,
      count: news.length,
      data: news,
    });
  } catch (error) {
    return next(error);
  }
});

// GET /api/news/trending?limit=10
router.get("/trending", async (req, res, next) => {
  try {
    const pagination = parsePagination(
      { limit: req.query.limit },
      DEFAULT_LIMIT,
    );

    if (!pagination) {
      return res.status(400).json({
        success: false,
        message: `Limit must be between 1 and ${MAX_LIMIT}.`,
      });
    }

    const news = await getNewsCollection()
      .find(publishedFilter())
      .project(PUBLIC_NEWS_PROJECTION)
      .sort({
        trendingScore: -1,
        publishedAt: -1,
        _id: -1,
      })
      .limit(pagination.limit)
      .toArray();

    return res.status(200).json({
      success: true,
      count: news.length,
      data: news,
    });
  } catch (error) {
    return next(error);
  }
});

// GET /api/news/search?q=technology&page=1&limit=10
router.get("/search", async (req, res, next) => {
  try {
    const searchTerm =
      typeof req.query.q === "string" ? req.query.q.trim() : "";

    if (!searchTerm || searchTerm.length > MAX_SEARCH_LENGTH) {
      return res.status(400).json({
        success: false,
        message: `Search query is required and must not exceed ${MAX_SEARCH_LENGTH} characters.`,
      });
    }

    const pagination = parsePagination(req.query);

    if (!pagination) {
      return res.status(400).json({
        success: false,
        message: "Invalid pagination parameters.",
      });
    }

    const searchRegex = {
      $regex: escapeRegex(searchTerm),
      $options: "i",
    };

    const filter = {
      ...publishedFilter(),
      $or: [
        { title: searchRegex },
        { excerpt: searchRegex },
        { content: searchRegex },
        { tags: searchRegex },
        { category: searchRegex },
      ],
    };

    const collection = getNewsCollection();
    const { page, limit, skip } = pagination;

    const [news, total] = await Promise.all([
      collection
        .find(filter)
        .project(PUBLIC_NEWS_PROJECTION)
        .sort({ publishedAt: -1, _id: -1 })
        .skip(skip)
        .limit(limit)
        .toArray(),

      collection.countDocuments(filter),
    ]);

    return sendPaginatedNews(res, {
      page,
      limit,
      total,
      news,
    });
  } catch (error) {
    return next(error);
  }
});

// GET /api/news/:identifier
// identifier may be a slug or MongoDB ObjectId.
router.get("/:identifier", async (req, res, next) => {
  try {
    const identifier =
      typeof req.params.identifier === "string"
        ? req.params.identifier.trim()
        : "";

    if (!identifier || identifier.length > MAX_IDENTIFIER_LENGTH) {
      return res.status(400).json({
        success: false,
        message: "A valid news slug or identifier is required.",
      });
    }

    const filter = publishedFilter();

    if (
      ObjectId.isValid(identifier) &&
      String(new ObjectId(identifier)) === identifier
    ) {
      filter._id = new ObjectId(identifier);
    } else {
      filter.slug = identifier;
    }

    const article = await getNewsCollection().findOne(filter, {
      projection: ARTICLE_PROJECTION,
    });

    if (!article) {
      return res.status(404).json({
        success: false,
        message: "News article not found.",
      });
    }

    return res.status(200).json({
      success: true,
      data: {
        ...article,
        publishedAt: buildPublishedDate(article),
      },
    });
  } catch (error) {
    return next(error);
  }
});

export default router;

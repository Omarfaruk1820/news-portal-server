import express from "express";
import { ObjectId } from "mongodb";
import { getDB } from "../config/db.js";

const router = express.Router();

const NEWS_COLLECTION = "news";
const DEFAULT_LIMIT = 10;
const MAX_LIMIT = 50;

const PUBLIC_NEWS_PROJECTION = {
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

const ARTICLE_PROJECTION = {
  title: 1,
  slug: 1,
  category: 1,
  excerpt: 1,
  content: 1,
  image: 1,
  author: 1,
  tags: 1,
  sourceUrl: 1,
  publishedAt: 1,
  createdAt: 1,
  updatedAt: 1,
  featured: 1,
};

const escapeRegex = (value) => value.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");

const parsePagination = (query, defaultLimit = DEFAULT_LIMIT) => {
  const page = Number(query.page ?? 1);
  const limit = Number(query.limit ?? defaultLimit);

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

const publishedFilter = () => ({
  status: "published",
});

const getNewsCollection = () => getDB().collection(NEWS_COLLECTION);

const sendPaginatedNews = (res, { page, limit, total, news }) => {
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
};

// GET /api/news
// All published news; optional category filter and pagination.
router.get("/", async (req, res, next) => {
  try {
    const pagination = parsePagination(req.query);

    if (!pagination) {
      return res.status(400).json({
        success: false,
        message: `Page must be positive. Limit must be between 1 and ${MAX_LIMIT}.`,
      });
    }

    const filter = publishedFilter();

    if (req.query.category !== undefined) {
      if (typeof req.query.category !== "string") {
        return res.status(400).json({
          success: false,
          message: "Category must be a single string.",
        });
      }

      const category = req.query.category.trim();

      if (!category || category.length > 80) {
        return res.status(400).json({
          success: false,
          message: "A valid category is required.",
        });
      }

      filter.category = {
        $regex: `^${escapeRegex(category)}$`,
        $options: "i",
      };
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
    const pagination = parsePagination({ limit: req.query.limit }, 10);

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
// Popularity is based on the stored views count.
router.get("/popular", async (req, res, next) => {
  try {
    const pagination = parsePagination({ limit: req.query.limit }, 10);

    if (!pagination) {
      return res.status(400).json({
        success: false,
        message: `Limit must be between 1 and ${MAX_LIMIT}.`,
      });
    }

    const news = await getNewsCollection()
      .find(publishedFilter())
      .project(PUBLIC_NEWS_PROJECTION)
      .sort({ views: -1, publishedAt: -1, _id: -1 })
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
// Trending is based on a stored trendingScore.
// Your publishing/admin workflow must maintain this score.
router.get("/trending", async (req, res, next) => {
  try {
    const pagination = parsePagination({ limit: req.query.limit }, 10);

    if (!pagination) {
      return res.status(400).json({
        success: false,
        message: `Limit must be between 1 and ${MAX_LIMIT}.`,
      });
    }

    const news = await getNewsCollection()
      .find(publishedFilter())
      .project(PUBLIC_NEWS_PROJECTION)
      .sort({ trendingScore: -1, publishedAt: -1, _id: -1 })
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

    if (!searchTerm || searchTerm.length > 100) {
      return res.status(400).json({
        success: false,
        message: "Search query is required and must not exceed 100 characters.",
      });
    }

    const pagination = parsePagination(req.query);

    if (!pagination) {
      return res.status(400).json({
        success: false,
        message: `Page must be positive. Limit must be between 1 and ${MAX_LIMIT}.`,
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
// A single published article by slug or ObjectId.
// Keep this route after named routes such as /latest and /search.
router.get("/:identifier", async (req, res, next) => {
  try {
    const identifier = req.params.identifier.trim();

    if (!identifier || identifier.length > 200) {
      return res.status(400).json({
        success: false,
        message: "A valid news identifier is required.",
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

    const news = await getNewsCollection().findOne(filter, {
      projection: ARTICLE_PROJECTION,
    });

    if (!news) {
      return res.status(404).json({
        success: false,
        message: "News article not found.",
      });
    }

    return res.status(200).json({
      success: true,
      data: {
        ...news,
        publishedAt: news.publishedAt || news.createdAt || null,
      },
    });
  } catch (error) {
    return next(error);
  }
});

export default router;

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

  return {
    page,
    limit,
    skip: (page - 1) * limit,
  };
};

const getPublishedFilter = () => ({
  status: "published",
});

const getPublishedDate = (news) => news.publishedAt || news.createdAt || null;

// GET /api/news
// Get all published news with pagination and optional category filtering.
router.get("/", async (req, res, next) => {
  try {
    const pagination = parsePagination(req.query);

    if (!pagination) {
      return res.status(400).json({
        success: false,
        message: `Invalid pagination. Page must be positive and limit must be between 1 and ${MAX_LIMIT}.`,
      });
    }

    const { page, limit, skip } = pagination;
    const filter = getPublishedFilter();

    if (req.query.category !== undefined) {
      const category = String(req.query.category).trim();

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

    const db = getDB();
    const newsCollection = db.collection(NEWS_COLLECTION);

    const [news, total] = await Promise.all([
      newsCollection
        .find(filter)
        .project(PUBLIC_NEWS_PROJECTION)
        .sort({ publishedAt: -1, _id: -1 })
        .skip(skip)
        .limit(limit)
        .toArray(),

      newsCollection.countDocuments(filter),
    ]);

    return res.status(200).json({
      success: true,
      message: "News fetched successfully.",
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

// GET /api/news/latest
// Get the latest published news.
router.get("/latest", async (req, res, next) => {
  try {
    const requestedLimit = Number(req.query.limit ?? 10);

    if (
      !Number.isSafeInteger(requestedLimit) ||
      requestedLimit < 1 ||
      requestedLimit > MAX_LIMIT
    ) {
      return res.status(400).json({
        success: false,
        message: `Limit must be between 1 and ${MAX_LIMIT}.`,
      });
    }

    const db = getDB();

    const news = await db
      .collection(NEWS_COLLECTION)
      .find(getPublishedFilter())
      .project(PUBLIC_NEWS_PROJECTION)
      .sort({ publishedAt: -1, _id: -1 })
      .limit(requestedLimit)
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

// GET /api/news/featured
// Get featured published news.
router.get("/featured", async (req, res, next) => {
  try {
    const requestedLimit = Number(req.query.limit ?? 5);

    if (
      !Number.isSafeInteger(requestedLimit) ||
      requestedLimit < 1 ||
      requestedLimit > MAX_LIMIT
    ) {
      return res.status(400).json({
        success: false,
        message: `Limit must be between 1 and ${MAX_LIMIT}.`,
      });
    }

    const db = getDB();

    const news = await db
      .collection(NEWS_COLLECTION)
      .find({
        ...getPublishedFilter(),
        featured: true,
      })
      .project(PUBLIC_NEWS_PROJECTION)
      .sort({ publishedAt: -1, _id: -1 })
      .limit(requestedLimit)
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
// Search published news by title, excerpt, content, or tags.
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
        message: `Invalid pagination. Page must be positive and limit must be between 1 and ${MAX_LIMIT}.`,
      });
    }

    const searchRegex = {
      $regex: escapeRegex(searchTerm),
      $options: "i",
    };

    const filter = {
      ...getPublishedFilter(),
      $or: [
        { title: searchRegex },
        { excerpt: searchRegex },
        { content: searchRegex },
        { tags: searchRegex },
      ],
    };

    const db = getDB();
    const newsCollection = db.collection(NEWS_COLLECTION);
    const { page, limit, skip } = pagination;

    const [news, total] = await Promise.all([
      newsCollection
        .find(filter)
        .project(PUBLIC_NEWS_PROJECTION)
        .sort({ publishedAt: -1, _id: -1 })
        .skip(skip)
        .limit(limit)
        .toArray(),

      newsCollection.countDocuments(filter),
    ]);

    return res.status(200).json({
      success: true,
      query: searchTerm,
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

// GET /api/news/:identifier
// Get a single published news article by slug or MongoDB ObjectId.
router.get("/:identifier", async (req, res, next) => {
  try {
    const identifier = req.params.identifier.trim();

    if (!identifier || identifier.length > 200) {
      return res.status(400).json({
        success: false,
        message: "A valid news identifier is required.",
      });
    }

    const filter = getPublishedFilter();

    if (
      ObjectId.isValid(identifier) &&
      String(new ObjectId(identifier)) === identifier
    ) {
      filter._id = new ObjectId(identifier);
    } else {
      filter.slug = identifier;
    }

    const db = getDB();

    const news = await db.collection(NEWS_COLLECTION).findOne(filter, {
      projection: {
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
      },
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
        publishedAt: getPublishedDate(news),
      },
    });
  } catch (error) {
    return next(error);
  }
});

export default router;

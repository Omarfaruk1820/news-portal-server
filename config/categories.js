const CATEGORY_SLUGS = Object.freeze({
  national: "জাতীয়",
  politics: "রাজনীতি",
  international: "আন্তর্জাতিক",
  economy: "অর্থনীতি",
  sports: "খেলাধুলা",
  entertainment: "বিনোদন",
  technology: "প্রযুক্তি",
  education: "শিক্ষা",
});

const CATEGORY_NAMES = Object.freeze(
  Object.fromEntries(
    Object.entries(CATEGORY_SLUGS).map(([slug, name]) => [name, slug]),
  ),
);

const MAX_CATEGORY_LENGTH = 80;

function normalizeCategory(value) {
  if (typeof value !== "string") {
    return null;
  }

  const normalized = value.trim().replace(/\s+/g, " ");

  if (!normalized || normalized.length > MAX_CATEGORY_LENGTH) {
    return null;
  }

  return normalized;
}

/**
 * Resolve a category slug or category name to its canonical Bengali name.
 *
 * Examples:
 * resolveCategoryName("technology") -> "প্রযুক্তি"
 * resolveCategoryName("প্রযুক্তি")   -> "প্রযুক্তি"
 * resolveCategoryName("unknown")     -> "unknown"
 * resolveCategoryName("")            -> null
 */
export function resolveCategoryName(value) {
  const normalized = normalizeCategory(value);

  if (!normalized) {
    return null;
  }

  const slug = normalized.toLowerCase();

  if (Object.prototype.hasOwnProperty.call(CATEGORY_SLUGS, slug)) {
    return CATEGORY_SLUGS[slug];
  }

  // Match category names exactly after whitespace normalization.
  if (Object.prototype.hasOwnProperty.call(CATEGORY_NAMES, normalized)) {
    return normalized;
  }

  // Preserve support for an unknown category name so callers can
  // decide whether to reject it or return an empty result.
  return normalized;
}

/**
 * Resolve a Bengali category name or known slug to its English slug.
 *
 * Examples:
 * getCategorySlug("প্রযুক্তি")   -> "technology"
 * getCategorySlug("technology") -> "technology"
 * getCategorySlug("unknown")    -> "unknown"
 * getCategorySlug("")           -> null
 */
export function getCategorySlug(categoryName) {
  const normalized = normalizeCategory(categoryName);

  if (!normalized) {
    return null;
  }

  const slug = normalized.toLowerCase();

  if (Object.prototype.hasOwnProperty.call(CATEGORY_SLUGS, slug)) {
    return slug;
  }

  if (Object.prototype.hasOwnProperty.call(CATEGORY_NAMES, normalized)) {
    return CATEGORY_NAMES[normalized];
  }

  return normalized;
}

export { CATEGORY_SLUGS };

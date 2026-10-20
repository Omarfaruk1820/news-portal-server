export const CATEGORY_SLUGS = {
  national: "জাতীয়",
  politics: "রাজনীতি",
  international: "আন্তর্জাতিক",
  economy: "অর্থনীতি",
  sports: "খেলাধুলা",
  entertainment: "বিনোদন",
  technology: "প্রযুক্তি",
  education: "শিক্ষা",
};

export function resolveCategoryName(value) {
  if (typeof value !== "string") {
    return null;
  }

  const normalized = value.trim();

  if (!normalized || normalized.length > 80) {
    return null;
  }

  const slug = normalized.toLowerCase();

  return CATEGORY_SLUGS[slug] ?? normalized;
}

export function getCategorySlug(categoryName) {
  const match = Object.entries(CATEGORY_SLUGS).find(
    ([, name]) => name === categoryName,
  );

  return match?.[0] ?? categoryName;
}

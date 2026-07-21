const slugify = (value) => {
    return String(value || "")
        .toLowerCase()
        .trim()
        .replace(/[^a-z0-9]+/g, "-")
        .replace(/^-+|-+$/g, "")
        .slice(0, 80) || "post";
};

const createUniqueSlug = async (Model, title, ignoreId = null) => {
    const base = slugify(title);
    let candidate = base;
    let index = 2;

    while (true) {
        const filter = { slug: candidate };
        if (ignoreId) filter._id = { $ne: ignoreId };

        const exists = await Model.exists(filter);
        if (!exists) return candidate;

        candidate = `${base}-${index}`;
        index += 1;
    }
};

module.exports = { slugify, createUniqueSlug };

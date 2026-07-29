"use strict";

const previewTheme = new URLSearchParams(window.location.search).get("theme");
const supportedPreviewThemes = new Set([
  "midnight-ledger",
  "executive-ivory",
  "slate-glass",
  "modern-forest",
]);

if (supportedPreviewThemes.has(previewTheme)) {
  document.body.dataset.theme = previewTheme;
}

const REQUIRED_COLUMNS = [
  "Product ID", "Product Name", "Category", "Actual Price", "Discounted Price",
  "Discount Percentage", "Rating", "Rating Count", "Customer Review",
];

const BOARD_FIELDS = [
  ["Product ID", "productId", ["product id", "product_id"], "Text"],
  ["Product Name", "productName", ["product name", "product_name"], "Text"],
  ["Category", "category", ["category"], "Text"],
  ["Actual Price", "actualPrice", ["actual price", "actual_price"], "Decimal/currency"],
  ["Discounted Price", "discountedPrice", ["discounted price", "discounted_price"], "Decimal/currency"],
  ["Discount Percentage", "discountPercentage", ["discount percentage", "discount_percentage"], "Decimal percentage"],
  ["Rating", "rating", ["rating"], "Decimal, 0–5"],
  ["Rating Count", "ratingCount", ["rating count", "rating_count"], "Whole number"],
  ["Customer Review", "customerReview", ["customer review", "review content", "review_content"], "Text"],
];

const STOP_WORDS = new Set([
  "a", "an", "and", "are", "as", "at", "be", "been", "but", "by", "for", "from",
  "had", "has", "have", "i", "in", "is", "it", "its", "my", "of", "on", "or", "our",
  "so", "that", "the", "their", "this", "to", "very", "was", "were", "with", "you", "your",
  "product", "item", "really", "quite", "much", "than", "would", "could", "after", "before",
]);

const POSITIVE_WORDS = new Set([
  "amazing", "awesome", "best", "comfortable", "durable", "easy", "excellent", "fast", "good",
  "great", "helpful", "impressed", "love", "loved", "perfect", "reliable", "smooth", "sturdy",
  "useful", "well", "wonderful",
]);

const NEGATIVE_WORDS = new Set([
  "awful", "bad", "broke", "broken", "cheap", "confusing", "difficult", "disappointed", "faulty",
  "hate", "horrible", "issue", "issues", "late", "poor", "problem", "problems", "refund", "slow",
  "terrible", "uncomfortable", "unreliable", "weak", "worse", "worst",
]);

const GENERIC_SENTIMENT_WORDS = new Set([...POSITIVE_WORDS, ...NEGATIVE_WORDS]);

const elements = {
  loading: document.querySelector("#loading"),
  dataStatus: document.querySelector("#data-status"),
  reloadData: document.querySelector("#reload-data"),
  results: document.querySelector("#results"),
  importNote: document.querySelector("#import-note"),
  reportGeneratedAt: document.querySelector("#report-generated-at"),
  overallMetrics: document.querySelector("#overall-metrics"),
  categoryCount: document.querySelector("#category-count"),
  categoryList: document.querySelector("#category-list"),
  refreshReport: document.querySelector("#refresh-report"),
  exportText: document.querySelector("#export-text"),
  exportCsv: document.querySelector("#export-csv"),
  printReport: document.querySelector("#print-report"),
  uploadedDataSummary: document.querySelector("#uploaded-data-summary"),
  uploadedDataBody: document.querySelector("#uploaded-data-body"),
  uploadedDataDetails: document.querySelector(".uploaded-data-details"),
  dataVerificationBody: document.querySelector("#data-verification-body"),
  parentCategoryFilter: document.querySelector("#parent-category-filter"),
  childCategoryFilter: document.querySelector("#child-category-filter"),
  subChildCategoryFilter: document.querySelector("#sub-child-category-filter"),
  productSearch: document.querySelector("#product-search"),
  tableSortToggle: document.querySelector("#table-sort-toggle"),
};

let currentReport = null;
let tableSortDirection = "ascending";

elements.reloadData.addEventListener("click", loadDataset);
elements.refreshReport.addEventListener("click", loadDataset);
elements.exportText.addEventListener("click", exportTextReport);
elements.exportCsv.addEventListener("click", exportCsvReport);
elements.printReport.addEventListener("click", () => window.print());
elements.parentCategoryFilter.addEventListener("change", handleParentCategoryChange);
elements.childCategoryFilter.addEventListener("change", handleChildCategoryChange);
elements.subChildCategoryFilter.addEventListener("change", renderFilteredViews);
elements.productSearch.addEventListener("input", renderFilteredViews);
elements.tableSortToggle.addEventListener("click", toggleTableSort);

async function loadDataset() {
  setLoading(true);
  setDataStatus("Loading approved Amazon product data…");

  try {
    await waitForPaint();
    const response = await fetch("./Data/amazon.csv", { cache: "no-store" });
    if (!response.ok) {
      throw new Error(`The dataset could not be loaded (${response.status}).`);
    }
    const contents = await response.text();
    const parsedRows = parseCsv(contents);
    const { records, skippedRows, fieldVerification } = validateAndNormalizeRows(parsedRows);
    currentReport = buildReport(
      records,
      skippedRows,
      "amazon.csv",
      fieldVerification,
      1,
    );
    renderReport(currentReport);
    setDataStatus(`${records.length.toLocaleString()} product records loaded from the approved dataset.`, "success");
  } catch (error) {
    currentReport = null;
    elements.results.hidden = true;
    setDataStatus(error.message || "The dataset could not be loaded. Serve the site through a web server and try again.", "error");
  } finally {
    setLoading(false);
  }
}

loadDataset();

function parseCsv(text) {
  if (!text || !text.trim()) {
    throw new Error("This CSV file does not contain any data.");
  }

  const rows = [];
  let row = [];
  let field = "";
  let insideQuotes = false;

  for (let index = 0; index < text.length; index += 1) {
    const character = text[index];
    const nextCharacter = text[index + 1];

    if (character === '"') {
      if (insideQuotes && nextCharacter === '"') {
        field += '"';
        index += 1;
      } else {
        insideQuotes = !insideQuotes;
      }
    } else if (character === "," && !insideQuotes) {
      row.push(field);
      field = "";
    } else if ((character === "\n" || character === "\r") && !insideQuotes) {
      if (character === "\r" && nextCharacter === "\n") {
        index += 1;
      }
      row.push(field);
      if (row.some((value) => value.trim() !== "")) {
        rows.push(row);
      }
      row = [];
      field = "";
    } else {
      field += character;
    }
  }

  if (insideQuotes) {
    throw new Error("The CSV contains an unclosed quotation mark. Correct the file and try again.");
  }

  row.push(field);
  if (row.some((value) => value.trim() !== "")) {
    rows.push(row);
  }

  if (rows.length < 2) {
    throw new Error("The CSV needs a header row and at least one product record.");
  }

  return rows;
}

function validateAndNormalizeRows(rows) {
  const normalizedHeaders = rows[0].map(normalizeHeader);
  const columnIndexes = new Map(normalizedHeaders.map((header, index) => [header, index]));
  const fieldIndexes = {};

  BOARD_FIELDS.forEach(([label, key, aliases]) => {
    fieldIndexes[key] = aliases.map((alias) => columnIndexes.get(alias)).find(Number.isInteger);
  });

  const missingRequiredColumns = REQUIRED_COLUMNS.filter((column) => {
    const field = BOARD_FIELDS.find(([label]) => label === column);
    return !Number.isInteger(fieldIndexes[field[1]]);
  });
  if (missingRequiredColumns.length > 0) {
    throw new Error(`Missing required column${missingRequiredColumns.length === 1 ? "" : "s"}: ${missingRequiredColumns.join(", ")}.`);
  }

  const records = [];
  let skippedRows = 0;
  const missingDataCounts = Object.fromEntries(BOARD_FIELDS.map(([, key]) => [key, 0]));
  const whitespaceOnlyCounts = Object.fromEntries(BOARD_FIELDS.map(([, key]) => [key, 0]));

  rows.slice(1).forEach((row) => {
    const getRawValue = (key) => {
      const index = fieldIndexes[key];
      return Number.isInteger(index) ? (row[index] || "") : "";
    };
    const getValue = (key) => {
      return getRawValue(key).trim();
    };
    const productName = getValue("productName");
    const category = getValue("category");

    BOARD_FIELDS.forEach(([, key]) => {
      const rawValue = getRawValue(key);
      if (!getValue(key)) {
        missingDataCounts[key] += 1;
        if (rawValue.length > 0) whitespaceOnlyCounts[key] += 1;
      }
    });

    if (!productName || !category) {
      skippedRows += 1;
      return;
    }

    records.push({
      productId: getRawValue("productId"),
      productName: getRawValue("productName"),
      category: getRawValue("category"),
      actualPriceRaw: getValue("actualPrice"),
      discountedPriceRaw: getValue("discountedPrice"),
      discountPercentageRaw: getValue("discountPercentage"),
      ratingRaw: getValue("rating"),
      ratingCountRaw: getValue("ratingCount"),
      actualPrice: parseNumber(getValue("actualPrice")),
      discountedPrice: parseNumber(getValue("discountedPrice")),
      discountPercentage: parseNumber(getValue("discountPercentage")),
      rating: clampRating(parseNumber(getValue("rating"))),
      ratingCount: parseNumber(getValue("ratingCount")),
      customerReview: getRawValue("customerReview"),
    });
  });

  if (records.length === 0) {
    throw new Error("No valid product records were found. Each row needs a Product Name and Category.");
  }

  const fieldVerification = BOARD_FIELDS.map(([label, key, , dataType]) => {
    const index = fieldIndexes[key];
    return {
      label,
      dataType,
      sourceHeader: Number.isInteger(index) ? rows[0][index].trim() : "Not provided",
      exists: Number.isInteger(index),
      missingValues: missingDataCounts[key],
      whitespaceOnlyValues: whitespaceOnlyCounts[key],
    };
  });

  return { records, skippedRows, fieldVerification };
}

function buildReport(records, skippedRows, fileName, fieldVerification, summaryDepth = 1) {
  const groupedRecords = new Map();

  records.forEach((record) => {
    const categoryLabel = getSummaryCategoryLabel(record, summaryDepth);
    const key = categoryLabel.toLocaleLowerCase();
    if (!groupedRecords.has(key)) {
      groupedRecords.set(key, { name: categoryLabel, records: [] });
    }
    groupedRecords.get(key).records.push(record);
  });

  const categories = Array.from(groupedRecords.values())
    .map(({ name, records: categoryRecords }) => analyzeCategory(name, categoryRecords))
    .sort((first, second) => first.name.localeCompare(second.name));

  const ratings = records.map((record) => record.rating).filter(isNumber);
  const mostReviewed = [...categories].sort((a, b) => b.totalRatingCount - a.totalRatingCount)[0];
  const ratedCategories = categories.filter((category) => isNumber(category.averageRating));
  const lowestRated = [...ratedCategories].sort((a, b) => a.averageRating - b.averageRating)[0] || null;

  return {
    fileName,
    importedRecords: records.length,
    skippedRows,
    categoryCount: categories.length,
    overallAverageRating: average(ratings),
    mostReviewedCategory: mostReviewed,
    lowestRatedCategory: lowestRated,
    categories,
    records,
    fieldVerification,
    generatedAt: new Date(),
  };
}

function analyzeCategory(name, records) {
  const ratings = records.map((record) => record.rating).filter(isNumber);
  const discounts = records.map((record) => record.discountPercentage).filter(isNumber);
  const ratedProducts = records.filter((record) => isNumber(record.rating));
  const sortedRatings = [...ratedProducts].sort((a, b) => b.rating - a.rating);
  const reviews = records.map((record) => record.customerReview).filter(Boolean);
  const praise = findFeedbackThemes(reviews, "positive");
  const complaints = findFeedbackThemes(reviews, "negative");

  const category = {
    name,
    productCount: records.length,
    averageActualPrice: average(records.map((record) => record.actualPrice).filter(isNumber)),
    averageDiscountedPrice: average(records.map((record) => record.discountedPrice).filter(isNumber)),
    averageRating: average(ratings),
    totalRatingCount: sum(records.map((record) => record.ratingCount)),
    averageDiscount: average(discounts),
    highestRatedProduct: sortedRatings[0] || null,
    lowestRatedProduct: sortedRatings[sortedRatings.length - 1] || null,
    praise,
    complaints,
  };

  category.summary = createCategorySummary(category);
  return category;
}

function findFeedbackThemes(reviews, sentiment) {
  const frequencies = new Map();
  const targetWords = sentiment === "positive" ? POSITIVE_WORDS : NEGATIVE_WORDS;
  const oppositeWords = sentiment === "positive" ? NEGATIVE_WORDS : POSITIVE_WORDS;

  reviews.forEach((review) => {
    const clauses = review.split(/\b(?:but|however|although|though|yet)\b|[.!?;,]/i);

    clauses.forEach((clause) => {
      const tokens = tokenize(clause);
      const targetScore = tokens.filter((token) => targetWords.has(token)).length;
      const oppositeScore = tokens.filter((token) => oppositeWords.has(token)).length;

      if (targetScore === 0 || targetScore < oppositeScore) {
        return;
      }

      const meaningfulTokens = tokens.filter(
        (token) => token.length > 2 && !STOP_WORDS.has(token) && !GENERIC_SENTIMENT_WORDS.has(token),
      );

      const uniqueCandidates = new Set(meaningfulTokens);
      for (let index = 0; index < meaningfulTokens.length - 1; index += 1) {
        uniqueCandidates.add(`${meaningfulTokens[index]} ${meaningfulTokens[index + 1]}`);
      }

      uniqueCandidates.forEach((candidate) => {
        frequencies.set(candidate, (frequencies.get(candidate) || 0) + 1);
      });
    });
  });

  const sortedThemes = Array.from(frequencies.entries()).sort((first, second) => {
    const countDifference = second[1] - first[1];
    if (countDifference !== 0) return countDifference;
    return second[0].split(" ").length - first[0].split(" ").length;
  });

  const selectedThemes = [];
  for (const [theme] of sortedThemes) {
    const overlaps = selectedThemes.some(
      (selected) => selected.includes(theme) || theme.includes(selected),
    );
    if (!overlaps) selectedThemes.push(theme);
    if (selectedThemes.length === 2) break;
  }

  if (selectedThemes.length === 0) {
    return sentiment === "positive"
      ? "No recurring praise identified"
      : "No recurring complaints identified";
  }

  return selectedThemes.join(", ");
}

function createCategorySummary(category) {
  const ratingText = isNumber(category.averageRating)
    ? `an average rating of ${category.averageRating.toFixed(1)} stars`
    : "no available average rating";
  const discountText = isNumber(category.averageDiscount)
    ? `${category.averageDiscount.toFixed(1)}%`
    : "no recorded discount";
  const praiseText = category.praise.startsWith("No recurring")
    ? "No recurring praise was identified"
    : `Customers frequently praised ${category.praise}`;
  const complaintText = category.complaints.startsWith("No recurring")
    ? "no recurring complaints were identified"
    : `common complaints mentioned ${category.complaints}`;

  return `${category.name} has ${ratingText} across ${formatNumber(category.productCount)} products and an average discount of ${discountText}. ${praiseText}, while ${complaintText}.`;
}

function renderReport(report) {
  renderSummary(report);
  renderDataVerification(report.fieldVerification);
  renderUploadedData(report);

  elements.results.hidden = false;
  elements.results.scrollIntoView({ behavior: "smooth", block: "start" });
}

function renderSummary(report) {
  elements.overallMetrics.replaceChildren();
  elements.categoryList.replaceChildren();

  const skippedText = report.skippedRows > 0
    ? ` ${report.skippedRows.toLocaleString()} incomplete row${report.skippedRows === 1 ? " was" : "s were"} skipped.`
    : "";
  elements.importNote.textContent = `${report.importedRecords.toLocaleString()} records imported from ${report.fileName}.${skippedText} See Data Verification for the field-by-field audit.`;
  elements.reportGeneratedAt.textContent = `Summary built: ${formatGeneratedTimestamp(report.generatedAt)}`;
  elements.categoryCount.textContent = `${report.categoryCount} categor${report.categoryCount === 1 ? "y" : "ies"}`;

  const overallMetrics = [
    ["Records", formatNumber(report.importedRecords)],
    ["Categories", formatNumber(report.categoryCount)],
    ["Average rating", formatRating(report.overallAverageRating)],
    ["Total ratings", formatNumber(report.categories.reduce((total, category) => total + category.totalRatingCount, 0))],
    ["Most reviewed", report.mostReviewedCategory?.name || "Not available", true],
    ["Lowest rated", report.lowestRatedCategory?.name || "Not available", true],
  ];

  overallMetrics.forEach(([label, value, isText]) => {
    const card = createElement("article", "metric-card");
    const labelElement = createElement("span", "", label);
    const valueElement = createElement("strong", isText ? "text-value" : "", value);
    card.append(labelElement, valueElement);
    elements.overallMetrics.append(card);
  });

  report.categories.forEach((category) => {
    elements.categoryList.append(createCategoryCard(category));
  });

}

function renderDataVerification(fieldVerification) {
  elements.dataVerificationBody.replaceChildren();

  fieldVerification.forEach((field) => {
    const row = document.createElement("tr");
    const availability = createElement(
      "span",
      `verification-status ${field.exists ? "available" : "placeholder"}`,
      field.exists ? "Available" : "Placeholder",
    );
    [field.label, field.sourceHeader, field.dataType].forEach((value) => {
      row.append(createElement("td", "", value));
    });
    const availabilityCell = document.createElement("td");
    availabilityCell.append(availability);
    row.append(
      availabilityCell,
      createElement("td", "", formatNumber(field.missingValues)),
      createElement("td", "", formatNumber(field.whitespaceOnlyValues)),
    );
    elements.dataVerificationBody.append(row);
  });
}

function renderUploadedData(report) {
  elements.uploadedDataBody.replaceChildren();
  elements.uploadedDataDetails.open = false;
  const recordLabel = report.records.length === 1 ? "record" : "records";
  elements.uploadedDataSummary.textContent = `View ${formatNumber(report.records.length)} imported ${recordLabel}`;

  const selectedParent = elements.parentCategoryFilter.value;
  const parentCategories = [...new Set(report.records.map(getParentCategory))]
    .sort((first, second) => first.localeCompare(second));
  elements.parentCategoryFilter.replaceChildren(new Option("All parent categories", ""));
  parentCategories.forEach((category) => elements.parentCategoryFilter.add(new Option(formatCategoryLabel(category), category)));
  elements.parentCategoryFilter.value = parentCategories.includes(selectedParent) ? selectedParent : "";
  populateChildCategoryFilter(report.records, elements.parentCategoryFilter.value);
  populateSubChildCategoryFilter(
    report.records,
    elements.parentCategoryFilter.value,
    elements.childCategoryFilter.value,
  );
  renderFilteredViews();
}

function handleParentCategoryChange() {
  if (!currentReport) return;
  populateChildCategoryFilter(currentReport.records, elements.parentCategoryFilter.value);
  populateSubChildCategoryFilter(currentReport.records, elements.parentCategoryFilter.value, "");
  renderFilteredViews();
}

function handleChildCategoryChange() {
  if (!currentReport) return;
  populateSubChildCategoryFilter(
    currentReport.records,
    elements.parentCategoryFilter.value,
    elements.childCategoryFilter.value,
  );
  renderFilteredViews();
}

function populateChildCategoryFilter(records, parentCategory) {
  const select = elements.childCategoryFilter;
  const selectedCategory = select.value;

  if (!parentCategory) {
    select.replaceChildren(new Option("Select a parent category first", ""));
    select.disabled = true;
    return;
  }

  const childCategories = [...new Set(
    records
      .filter((record) => getParentCategory(record) === parentCategory)
      .map((record) => getCategoryPath(record)[1])
      .filter(Boolean),
  )].sort((first, second) => first.localeCompare(second));
  select.replaceChildren(new Option("All child categories", ""));
  childCategories.forEach((category) => select.add(new Option(formatCategoryLabel(category), category)));
  select.value = childCategories.includes(selectedCategory) ? selectedCategory : "";
  select.disabled = false;
}

function populateSubChildCategoryFilter(records, parentCategory, childCategory) {
  const select = elements.subChildCategoryFilter;
  const selectedCategory = select.value;

  if (!parentCategory || !childCategory) {
    select.replaceChildren(new Option("Select a child category first", ""));
    select.disabled = true;
    return;
  }

  const subChildCategories = [...new Set(
    records
      .filter((record) => getParentCategory(record) === parentCategory)
      .filter((record) => getCategoryPath(record)[1] === childCategory)
      .map((record) => getCategoryPath(record)[2])
      .filter(Boolean),
  )].sort((first, second) => first.localeCompare(second));

  if (subChildCategories.length === 0) {
    select.replaceChildren(new Option("No sub-child categories", ""));
    select.disabled = true;
    return;
  }

  select.replaceChildren(new Option("All sub-child categories", ""));
  subChildCategories.forEach((category) => select.add(new Option(formatCategoryLabel(category), category)));
  select.value = subChildCategories.includes(selectedCategory) ? selectedCategory : "";
  select.disabled = false;
}

function renderFilteredViews() {
  if (!currentReport) return;

  const records = getFilteredRecords();
  const filteredReport = buildReport(
    records,
    0,
    currentReport.fileName,
    currentReport.fieldVerification,
    getSummaryDepth(),
  );
  renderSummary(filteredReport);
  renderCurrentTable(records);
}

function renderCurrentTable(records = getFilteredRecords()) {
  if (!currentReport) return;

  const sortedRecords = [...records]
    .sort((first, second) => {
      const comparison = first.productName.localeCompare(second.productName, undefined, { sensitivity: "base" });
      return tableSortDirection === "ascending" ? comparison : -comparison;
    });

  elements.uploadedDataBody.replaceChildren();

  const recordLabel = sortedRecords.length === 1 ? "record" : "records";
  elements.uploadedDataSummary.textContent = `View ${formatNumber(sortedRecords.length)} matching ${recordLabel}`;

  sortedRecords.forEach((record) => {
    const row = document.createElement("tr");
    [
      record.productId,
      record.productName,
      formatProductCategory(record),
      record.actualPriceRaw || "Not provided",
      record.discountedPriceRaw || "Not provided",
      record.discountPercentageRaw || "Not provided",
      record.ratingRaw || "Not provided",
      record.ratingCountRaw || "Not provided",
      record.customerReview || "Not provided",
    ].forEach((value) => {
      row.append(createElement("td", "", value));
    });
    elements.uploadedDataBody.append(row);
  });
}

function getParentCategory(record) {
  return getCategoryPath(record)[0] || "";
}

function getCategoryPath(record) {
  return record.category.split("|").map((segment) => segment.trim()).filter(Boolean);
}

function getSummaryDepth() {
  if (elements.subChildCategoryFilter.value) return 3;
  if (elements.childCategoryFilter.value) return 2;
  return 1;
}

function getSummaryCategoryLabel(record, depth) {
  return getCategoryPath(record).slice(0, depth).map(formatCategoryLabel).join(" | ");
}

function formatProductCategory(record) {
  const path = getCategoryPath(record);
  return path.length > 1
    ? `${formatCategoryLabel(path[0])} | ${formatCategoryLabel(path[path.length - 1])}`
    : formatCategoryLabel(path[0] || "Not provided");
}

function formatCategoryLabel(value) {
  return value
    .replace(/,/g, ", ")
    .replace(/&/g, " & ")
    .replace(/([a-z])([A-Z])/g, "$1 $2")
    .replace(/([A-Z]+)([A-Z][a-z])/g, "$1 $2")
    .replace(/\s+/g, " ")
    .trim();
}

function getFilteredRecords() {
  if (!currentReport) return [];

  const parentCategory = elements.parentCategoryFilter.value;
  const childCategory = elements.childCategoryFilter.value;
  const subChildCategory = elements.subChildCategoryFilter.value;
  const searchTerm = elements.productSearch.value.trim().toLocaleLowerCase();

  return currentReport.records
    .filter((record) => !parentCategory || getCategoryPath(record)[0] === parentCategory)
    .filter((record) => !childCategory || getCategoryPath(record)[1] === childCategory)
    .filter((record) => !subChildCategory || getCategoryPath(record)[2] === subChildCategory)
    .filter((record) => !searchTerm || [record.productName, record.productId]
      .some((value) => value.toLocaleLowerCase().includes(searchTerm)));
}

function toggleTableSort() {
  tableSortDirection = tableSortDirection === "ascending" ? "descending" : "ascending";
  updateTableSortButton();
  renderCurrentTable();
}

function updateTableSortButton() {
  const isDescending = tableSortDirection === "descending";
  elements.tableSortToggle.textContent = `Product name: ${tableSortDirection}`;
  elements.tableSortToggle.setAttribute("aria-pressed", String(isDescending));
}

function formatDataValue(value) {
  if (!isNumber(value)) {
    return "Not available";
  }
  return value.toLocaleString(undefined, { maximumFractionDigits: 2 });
}

function formatGeneratedTimestamp(date) {
  return date.toLocaleString([], {
    dateStyle: "full",
    timeStyle: "medium",
  });
}

function createCategoryCard(category) {
  const article = createElement("article", "category-card");
  const header = createElement("header", "category-card-header");
  header.append(
    createElement("h4", "", category.name),
    createElement("span", "rating-badge", `★ ${formatRating(category.averageRating)}`),
  );

  const body = createElement("div", "category-card-body");
  const metrics = createElement("div", "category-metrics");
  [
    ["Average actual price", formatDataValue(category.averageActualPrice)],
    ["Average discounted price", formatDataValue(category.averageDiscountedPrice)],
    ["Average discount", formatPercentage(category.averageDiscount)],
    ["Products", formatNumber(category.productCount)],
    ["Rating count", formatNumber(category.totalRatingCount)],
  ].forEach(([label, value]) => {
    const metric = createElement("div", "category-metric");
    metric.append(createElement("span", "", label), createElement("strong", "", value));
    metrics.append(metric);
  });

  const feedback = createElement("div", "feedback-grid");
  const praise = createElement("div", "feedback-block");
  praise.append(createElement("span", "", "Common praise"), createElement("p", "", category.praise));
  const complaint = createElement("div", "feedback-block complaint");
  complaint.append(createElement("span", "", "Common complaints"), createElement("p", "", category.complaints));
  feedback.append(praise, complaint);

  const summary = createElement("p", "summary-box", category.summary);
  const extremes = createElement("p", "product-extremes");
  const highest = category.highestRatedProduct
    ? `${category.highestRatedProduct.productName} (${category.highestRatedProduct.rating.toFixed(1)})`
    : "Not available";
  const lowest = category.lowestRatedProduct
    ? `${category.lowestRatedProduct.productName} (${category.lowestRatedProduct.rating.toFixed(1)})`
    : "Not available";
  extremes.append(
    createElement("strong", "", "Highest rated: "),
    document.createTextNode(`${highest} · `),
    createElement("strong", "", "Lowest rated: "),
    document.createTextNode(lowest),
  );

  body.append(metrics, feedback, summary, extremes);
  article.append(header, body);
  return article;
}

function exportTextReport() {
  if (!currentReport) return;

  const report = currentReport;
  const lines = [
    "E-COMMERCE PRODUCT INSIGHTS REPORT",
    `Generated: ${report.generatedAt.toLocaleString()}`,
    `Source: ${report.fileName}`,
    "",
    "OVERALL SUMMARY",
    `Records: ${formatNumber(report.importedRecords)}`,
    `Categories: ${formatNumber(report.categoryCount)}`,
    `Average rating: ${formatRating(report.overallAverageRating)}`,
    `Most-reviewed category: ${report.mostReviewedCategory?.name || "Not available"}`,
    `Lowest-rated category: ${report.lowestRatedCategory?.name || "Not available"}`,
    "",
    "CATEGORY REPORTS",
  ];

  report.categories.forEach((category) => {
    lines.push(
      "",
      category.name.toUpperCase(),
      `Average rating: ${formatRating(category.averageRating)}`,
      `Average actual price: ${formatDataValue(category.averageActualPrice)}`,
      `Average discounted price: ${formatDataValue(category.averageDiscountedPrice)}`,
      `Average discount: ${formatPercentage(category.averageDiscount)}`,
      `Product count: ${formatNumber(category.productCount)}`,
      `Common praise: ${category.praise}`,
      `Common complaints: ${category.complaints}`,
      `Summary: ${category.summary}`,
    );
  });

  downloadFile(lines.join("\n"), "product-insights-report.txt", "text/plain;charset=utf-8");
}

function exportCsvReport() {
  if (!currentReport) return;

  const headers = [
    "Category", "Product Count", "Average Actual Price", "Average Discounted Price", "Average Rating", "Total Rating Count",
    "Average Discount Percentage", "Highest-Rated Product", "Lowest-Rated Product",
    "Common Praise", "Common Complaints", "Summary",
  ];
  const rows = currentReport.categories.map((category) => [
    category.name,
    category.productCount,
    category.averageActualPrice?.toFixed(2) || "",
    category.averageDiscountedPrice?.toFixed(2) || "",
    category.averageRating?.toFixed(2) || "",
    category.totalRatingCount,
    category.averageDiscount?.toFixed(2) || "",
    category.highestRatedProduct?.productName || "",
    category.lowestRatedProduct?.productName || "",
    category.praise,
    category.complaints,
    category.summary,
  ]);
  const csv = [headers, ...rows].map((row) => row.map(escapeCsvValue).join(",")).join("\n");
  downloadFile(csv, "product-insights-summary.csv", "text/csv;charset=utf-8");
}

function normalizeHeader(header) {
  return header.replace(/^\uFEFF/, "").trim().toLocaleLowerCase().replace(/\s+/g, " ");
}

function parseNumber(value) {
  if (!value) return null;
  const isNegative = /^\(.*\)$/.test(value.trim());
  const normalized = value.replace(/[^0-9.+-]/g, "");
  const number = Number.parseFloat(normalized);
  if (!Number.isFinite(number)) return null;
  return isNegative ? -Math.abs(number) : number;
}

function clampRating(rating) {
  if (!isNumber(rating)) return null;
  return Math.min(5, Math.max(0, rating));
}

function tokenize(text) {
  return text.toLocaleLowerCase().replace(/[^a-z0-9'\s-]/g, " ").split(/\s+/).filter(Boolean);
}

function sum(values) {
  return values.filter(isNumber).reduce((total, value) => total + value, 0);
}

function average(values) {
  return values.length ? sum(values) / values.length : null;
}

function isNumber(value) {
  return typeof value === "number" && Number.isFinite(value);
}

function formatNumber(value) {
  return Math.round(value || 0).toLocaleString();
}

function formatRating(value) {
  return isNumber(value) ? `${value.toFixed(1)} stars` : "Not available";
}

function formatPercentage(value) {
  return isNumber(value) ? `${value.toFixed(1)}%` : "Not available";
}

function escapeCsvValue(value) {
  const text = String(value ?? "");
  return `"${text.replace(/"/g, '""')}"`;
}

function createElement(tagName, className = "", text = "") {
  const element = document.createElement(tagName);
  if (className) element.className = className;
  if (text !== "") element.textContent = text;
  return element;
}

function setDataStatus(message, type = "") {
  elements.dataStatus.textContent = message;
  elements.dataStatus.className = `summary-message ${type}`.trim();
}

function setLoading(isLoading) {
  elements.loading.hidden = !isLoading;
  elements.reloadData.disabled = isLoading;
  elements.refreshReport.disabled = isLoading;
}

function waitForPaint() {
  return new Promise((resolve) => requestAnimationFrame(() => requestAnimationFrame(resolve)));
}

function downloadFile(contents, fileName, mimeType) {
  const blob = new Blob([contents], { type: mimeType });
  const url = URL.createObjectURL(blob);
  const link = document.createElement("a");
  link.href = url;
  link.download = fileName;
  document.body.append(link);
  link.click();
  link.remove();
  URL.revokeObjectURL(url);
}

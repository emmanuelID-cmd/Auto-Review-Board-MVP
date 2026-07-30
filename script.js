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
const INR_TO_USD_RATE_URL = "https://api.frankfurter.dev/v2/rate/INR/USD";
const RAW_EXPORT_HEADERS = [
  "Product ID", "Product Name", "Category", "Actual Price (USD)", "Discounted Price (USD)",
  "Discount Percentage", "Rating", "Rating Count", "Customer Review",
];

const elements = {
  loading: document.querySelector("#loading"),
  dataStatus: document.querySelector("#data-status"),
  reloadData: document.querySelector("#reload-data"),
  datasetFile: document.querySelector("#dataset-file"),
  datasetDropZone: document.querySelector("#dataset-drop-zone"),
  googleSheetUrl: document.querySelector("#google-sheet-url"),
  loadGoogleSheet: document.querySelector("#load-google-sheet"),
  results: document.querySelector("#results"),
  importNote: document.querySelector("#import-note"),
  reportGeneratedAt: document.querySelector("#report-generated-at"),
  overallTitle: document.querySelector("#overall-title"),
  overallMetrics: document.querySelector("#overall-metrics"),
  categoryCount: document.querySelector("#category-count"),
  categoryList: document.querySelector("#category-list"),
  productSummarySection: document.querySelector("#product-summary-section"),
  productMatchNote: document.querySelector("#product-match-note"),
  productSummaryList: document.querySelector("#product-summary-list"),
  refreshReport: document.querySelector("#refresh-report"),
  exportText: document.querySelector("#export-text"),
  exportCsv: document.querySelector("#export-csv"),
  exportXlsx: document.querySelector("#export-xlsx"),
  exportRecordsText: document.querySelector("#export-records-text"),
  exportRecordsCsv: document.querySelector("#export-records-csv"),
  exportRecordsXlsx: document.querySelector("#export-records-xlsx"),
  printReport: document.querySelector("#print-report"),
  printRecords: document.querySelector("#print-records"),
  uploadedDataSummary: document.querySelector("#uploaded-data-summary"),
  uploadedDataBody: document.querySelector("#uploaded-data-body"),
  uploadedDataDetails: document.querySelector(".uploaded-data-details"),
  reviewDialog: document.querySelector("#review-dialog"),
  reviewDialogContent: document.querySelector("#review-dialog-content"),
  closeReviewDialog: document.querySelector("#close-review-dialog"),
  parentCategoryFilter: document.querySelector("#parent-category-filter"),
  childCategoryFilter: document.querySelector("#child-category-filter"),
  subChildCategoryFilter: document.querySelector("#sub-child-category-filter"),
  productSearch: document.querySelector("#product-search"),
  tableSortToggle: document.querySelector("#table-sort-toggle"),
  ratingSortToggle: document.querySelector("#rating-sort-toggle"),
};

let currentReport = null;
let tableSortDirection = "ascending";
let ratingSortDirection = "ascending";
let tableSortCriterion = "name";
let nextNameSortDirection = "ascending";
let nextRatingSortDirection = "ascending";
let activeSource = { kind: "amazon" };

elements.reloadData.addEventListener("click", loadAmazonDataset);
elements.refreshReport.addEventListener("click", refreshActiveDataset);
elements.datasetFile.addEventListener("change", () => loadUploadedFile(elements.datasetFile.files[0]));
elements.datasetDropZone.addEventListener("click", () => elements.datasetFile.click());
elements.datasetDropZone.addEventListener("keydown", (event) => {
  if (event.key === "Enter" || event.key === " ") {
    event.preventDefault();
    elements.datasetFile.click();
  }
});
elements.datasetDropZone.addEventListener("dragover", (event) => {
  event.preventDefault();
  elements.datasetDropZone.classList.add("is-dragging");
});
elements.datasetDropZone.addEventListener("dragleave", () => elements.datasetDropZone.classList.remove("is-dragging"));
elements.datasetDropZone.addEventListener("drop", (event) => {
  event.preventDefault();
  elements.datasetDropZone.classList.remove("is-dragging");
  loadUploadedFile(event.dataTransfer.files[0]);
});
elements.loadGoogleSheet.addEventListener("click", loadGoogleSheet);
elements.exportText.addEventListener("click", exportTextReport);
elements.exportCsv.addEventListener("click", exportCsvReport);
elements.exportXlsx.addEventListener("click", exportXlsxReport);
elements.exportRecordsText.addEventListener("click", exportRecordsText);
elements.exportRecordsCsv.addEventListener("click", exportRecordsCsv);
elements.exportRecordsXlsx.addEventListener("click", exportRecordsXlsx);
elements.printReport.addEventListener("click", printSummary);
elements.printRecords.addEventListener("click", printRecords);
elements.parentCategoryFilter.addEventListener("change", handleParentCategoryChange);
elements.childCategoryFilter.addEventListener("change", handleChildCategoryChange);
elements.subChildCategoryFilter.addEventListener("change", renderFilteredViews);
elements.productSearch.addEventListener("input", renderFilteredViews);
elements.tableSortToggle.addEventListener("click", toggleTableSort);
elements.ratingSortToggle.addEventListener("click", toggleRatingSort);
elements.uploadedDataBody.addEventListener("click", handleReviewAction);
elements.closeReviewDialog.addEventListener("click", () => elements.reviewDialog.close());
elements.reviewDialog.addEventListener("click", (event) => {
  if (event.target === elements.reviewDialog) elements.reviewDialog.close();
});

async function loadAmazonDataset() {
  setLoading(true);
  setDataStatus("Loading approved Amazon product data…");

  try {
    await waitForPaint();
    const response = await fetch("./Data/amazon.csv", { cache: "no-store" });
    if (!response.ok) {
      throw new Error(`The dataset could not be loaded (${response.status}).`);
    }
    await applyRows(parseCsv(await response.text()), "amazon.csv", { kind: "amazon" });
  } catch (error) {
    handleDataLoadError(error);
  } finally {
    setLoading(false);
  }
}

loadAmazonDataset();

async function loadUploadedFile(file) {
  if (!file) return;
  setLoading(true);
  setDataStatus(`Loading ${file.name}…`);

  try {
    const rows = await readFileRows(file);
    await applyRows(rows, file.name, { kind: "file", file });
  } catch (error) {
    handleDataLoadError(error);
  } finally {
    elements.datasetFile.value = "";
    setLoading(false);
  }
}

async function loadGoogleSheet() {
  const sourceUrl = elements.googleSheetUrl.value.trim();
  if (!sourceUrl) {
    setDataStatus("Paste a public Google Sheet link before loading it.", "error");
    return;
  }

  setLoading(true);
  setDataStatus("Loading public Google Sheet…");
  try {
    const csvUrl = getGoogleSheetCsvUrl(sourceUrl);
    const response = await fetch(csvUrl, { cache: "no-store" });
    if (!response.ok) throw new Error(`The Google Sheet could not be loaded (${response.status}). Check its sharing settings.`);
    await applyRows(parseCsv(await response.text()), "Google Sheet", { kind: "google-sheet", sourceUrl });
  } catch (error) {
    handleDataLoadError(error);
  } finally {
    setLoading(false);
  }
}

async function refreshActiveDataset() {
  if (activeSource.kind === "file") {
    await loadUploadedFile(activeSource.file);
    return;
  }
  if (activeSource.kind === "google-sheet") {
    elements.googleSheetUrl.value = activeSource.sourceUrl;
    await loadGoogleSheet();
    return;
  }
  await loadAmazonDataset();
}

async function applyRows(rows, fileName, source) {
  const { records, skippedRows, fieldVerification } = validateAndNormalizeRows(rows);
  await normalizePricesToUsd(records);
  resetDataFilters();
  activeSource = source;
  currentReport = buildReport(records, skippedRows, fileName, fieldVerification, 1);
  renderReport(currentReport, { scrollToResults: source.kind !== "amazon" });
  setDataStatus(`${records.length.toLocaleString()} product records loaded from ${fileName}. Prices are shown in USD.`, "success");
}

function handleDataLoadError(error) {
  setDataStatus(error.message || "The dataset could not be loaded. Check the file format and required columns.", "error");
}

async function readFileRows(file) {
  const extension = file.name.split(".").pop().toLocaleLowerCase();
  if (extension === "csv") return parseCsv(await file.text());
  if (!new Set(["xls", "xlsx", "ods"]).has(extension)) {
    throw new Error("Choose a CSV, XLS, XLSX, or ODS file.");
  }
  if (!window.XLSX) throw new Error("Spreadsheet support could not be loaded. Check your internet connection and try again.");

  const workbook = window.XLSX.read(await file.arrayBuffer(), { type: "array" });
  const worksheet = workbook.Sheets[workbook.SheetNames[0]];
  if (!worksheet) throw new Error("The spreadsheet does not contain a worksheet.");
  return window.XLSX.utils.sheet_to_json(worksheet, { header: 1, defval: "", raw: false })
    .map((row) => row.map((value) => String(value)));
}

function getGoogleSheetCsvUrl(sourceUrl) {
  const url = new URL(sourceUrl);
  const match = url.pathname.match(/\/spreadsheets\/d\/([^/]+)/);
  if (!match || !url.hostname.endsWith("google.com")) {
    throw new Error("Use a public Google Sheets link from docs.google.com.");
  }
  const fragmentParams = new URLSearchParams(url.hash.replace(/^#/, ""));
  const gid = url.searchParams.get("gid") || fragmentParams.get("gid") || "0";
  return `https://docs.google.com/spreadsheets/d/${match[1]}/gviz/tq?tqx=out:csv&gid=${encodeURIComponent(gid)}`;
}

function resetDataFilters() {
  elements.parentCategoryFilter.value = "";
  elements.childCategoryFilter.value = "";
  elements.subChildCategoryFilter.value = "";
  elements.productSearch.value = "";
  tableSortDirection = "ascending";
  ratingSortDirection = "ascending";
  tableSortCriterion = "name";
  nextNameSortDirection = "ascending";
  nextRatingSortDirection = "ascending";
  updateTableSortButton();
  updateRatingSortButton();
}

async function fetchUsdRate() {
  const response = await fetch(INR_TO_USD_RATE_URL, { cache: "no-store" });
  if (!response.ok) {
    throw new Error("The USD conversion rate could not be loaded.");
  }

  const { rate } = await response.json();
  if (!isNumber(rate) || rate <= 0) {
    throw new Error("The USD conversion rate is invalid.");
  }
  return rate;
}

async function normalizePricesToUsd(records) {
  const needsInrConversion = records.some((record) => /₹/.test(record.actualPriceRaw) || /₹/.test(record.discountedPriceRaw));
  if (!needsInrConversion) return;

  const rate = await fetchUsdRate();
  records.forEach((record) => {
    record.actualPrice = isNumber(record.actualPrice) ? record.actualPrice * rate : null;
    record.discountedPrice = isNumber(record.discountedPrice) ? record.discountedPrice * rate : null;
  });
}

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
  const actualPrices = records.map((record) => record.actualPrice).filter(isNumber);
  const discountedPrices = records.map((record) => record.discountedPrice).filter(isNumber);
  const discounts = records.map((record) => record.discountPercentage).filter(isNumber);
  const ratingCounts = records.map((record) => record.ratingCount).filter(isNumber);
  const mostReviewed = [...categories].sort((a, b) => b.totalRatingCount - a.totalRatingCount)[0];
  const ratedCategories = categories.filter((category) => isNumber(category.averageRating));
  const lowestRated = [...ratedCategories].sort((a, b) => a.averageRating - b.averageRating)[0] || null;

  return {
    fileName,
    importedRecords: records.length,
    skippedRows,
    categoryCount: categories.length,
    overallAverageActualPrice: average(actualPrices),
    overallAverageDiscountedPrice: average(discountedPrices),
    overallAverageDiscount: average(discounts),
    overallAverageRating: average(ratings),
    overallAverageRatingCount: average(ratingCounts),
    overallTotalRatingCount: sum(ratingCounts),
    overallReviewCount: records.filter((record) => record.customerReview.trim() !== "").length,
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
  const ratingCounts = records.map((record) => record.ratingCount).filter(isNumber);
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
    averageRatingCount: average(ratingCounts),
    totalRatingCount: sum(ratingCounts),
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

function renderReport(report, { scrollToResults = false } = {}) {
  renderSummary(report);
  renderUploadedData(report);

  elements.results.hidden = false;
  if (scrollToResults) {
    elements.results.scrollIntoView({ behavior: "smooth", block: "start" });
  }
}

function renderSummary(report) {
  elements.overallMetrics.replaceChildren();
  elements.categoryList.replaceChildren();

  const skippedText = report.skippedRows > 0
    ? ` ${report.skippedRows.toLocaleString()} incomplete row${report.skippedRows === 1 ? " was" : "s were"} skipped.`
    : "";
  elements.importNote.textContent = `${report.importedRecords.toLocaleString()} records imported from ${report.fileName}.${skippedText}`;
  elements.overallTitle.textContent = hasActiveProductFilters() ? "Filtered Products Summary" : "All Products Summary";
  elements.reportGeneratedAt.textContent = `Summary built: ${formatGeneratedTimestamp(report.generatedAt)}`;
  elements.categoryCount.textContent = `${report.categoryCount} categor${report.categoryCount === 1 ? "y" : "ies"}`;

  const overallMetrics = [
    ["Product records", formatNumber(report.importedRecords)],
    [hasActiveProductFilters() ? "Summary categories" : "Parent categories", formatNumber(report.categoryCount)],
    ["Average actual price", formatDataValue(report.overallAverageActualPrice)],
    ["Average discounted price", formatDataValue(report.overallAverageDiscountedPrice)],
    ["Average discount", formatPercentage(report.overallAverageDiscount)],
    ["Average rating", formatRating(report.overallAverageRating)],
    ["Average rating count", formatAverageNumber(report.overallAverageRatingCount)],
    ["Total rating count", formatNumber(report.overallTotalRatingCount)],
    ["Reviews", formatNumber(report.overallReviewCount)],
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

  [...report.categories].sort(compareSummaryItems).forEach((category) => {
    elements.categoryList.append(createCategoryCard(category));
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
  renderProductSummaries(records);
  renderCurrentTable(records);
}

function renderProductSummaries(records) {
  const searchTerm = elements.productSearch.value.trim();
  elements.productSummaryList.replaceChildren();
  elements.productSummarySection.hidden = !searchTerm;

  if (!searchTerm) return;

  const groupedProducts = new Map();
  records.forEach((record) => {
    const key = record.productId.trim();
    if (!groupedProducts.has(key)) groupedProducts.set(key, []);
    groupedProducts.get(key).push(record);
  });

  const products = Array.from(groupedProducts.entries()).map(([productId, productRecords]) => {
    const [firstRecord] = productRecords;
    return {
      productId,
      productName: firstRecord.productName,
      recordCount: productRecords.length,
      averageActualPrice: average(productRecords.map((record) => record.actualPrice).filter(isNumber)),
      averageDiscountedPrice: average(productRecords.map((record) => record.discountedPrice).filter(isNumber)),
      averageDiscount: average(productRecords.map((record) => record.discountPercentage).filter(isNumber)),
      averageRating: average(productRecords.map((record) => record.rating).filter(isNumber)),
      averageRatingCount: average(productRecords.map((record) => record.ratingCount).filter(isNumber)),
    };
  }).sort(compareSummaryItems);

  const productLabel = products.length === 1 ? "product" : "products";
  elements.productMatchNote.textContent = `Products matching search: ${formatNumber(products.length)} ${productLabel}.`;

  if (products.length === 0) {
    elements.productSummaryList.append(createElement("p", "product-summary-empty", "No products match this search."));
    return;
  }

  products.forEach((product) => {
    const card = createElement("article", "product-summary-card");
    const header = createElement("header", "product-summary-card-header");
    const identity = createElement("div", "product-summary-identity");
    identity.append(
      createElement("span", "product-id-label", `Product ID: ${product.productId}`),
      createElement("h5", "", product.productName),
    );
    header.append(identity, createElement("span", "product-record-count", `${formatNumber(product.recordCount)} source row${product.recordCount === 1 ? "" : "s"}`));

    const metrics = createElement("div", "product-summary-metrics");
    [
      ["Actual price", formatDataValue(product.averageActualPrice)],
      ["Discounted price", formatDataValue(product.averageDiscountedPrice)],
      ["Discount", formatPercentage(product.averageDiscount)],
      ["Rating", formatRating(product.averageRating)],
      ["Rating count", formatAverageNumber(product.averageRatingCount)],
      ["Review records", formatNumber(product.recordCount)],
    ].forEach(([label, value]) => {
      const metric = createElement("div", "product-summary-metric");
      metric.append(createElement("span", "", label), createElement("strong", "", value));
      metrics.append(metric);
    });

    card.append(header, metrics);
    elements.productSummaryList.append(card);
  });
}

function renderCurrentTable(records = getFilteredRecords()) {
  if (!currentReport) return;

  const sortedRecords = getVisibleRecords(records);

  elements.uploadedDataBody.replaceChildren();

  const recordLabel = sortedRecords.length === 1 ? "record" : "records";
  elements.uploadedDataSummary.textContent = `View ${formatNumber(sortedRecords.length)} matching ${recordLabel}`;

  sortedRecords.forEach((record) => {
    const row = document.createElement("tr");
    const values = [
      record.productId,
      record.productName,
      formatProductCategory(record),
      formatDataValue(record.actualPrice),
      formatDataValue(record.discountedPrice),
      record.discountPercentageRaw || "Not provided",
      record.ratingRaw || "Not provided",
      record.ratingCountRaw || "Not provided",
      record.customerReview || "Not provided",
    ];
    values.forEach((value, index) => {
      const cell = document.createElement("td");
      if (index === values.length - 1) {
        cell.className = "review-cell";
        cell.append(createElement("div", "review-cell-content", value));
        const expandButton = createElement("button", "review-expand-button", "Expand");
        expandButton.type = "button";
        expandButton.reviewText = value;
        cell.append(expandButton);
      } else {
        cell.append(createElement("div", "table-cell-content", value));
      }
      row.append(cell);
    });
    elements.uploadedDataBody.append(row);
  });
}

function handleReviewAction(event) {
  const button = event.target.closest(".review-expand-button");
  if (!button) return;

  elements.reviewDialogContent.textContent = button.reviewText;
  elements.reviewDialog.showModal();
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

function getVisibleRecords(records = getFilteredRecords()) {
  return [...records].sort(compareSummaryItems);
}

function getVisibleReport() {
  if (!currentReport) return null;
  return buildReport(
    getFilteredRecords(),
    0,
    currentReport.fileName,
    currentReport.fieldVerification,
    getSummaryDepth(),
  );
}

function hasActiveProductFilters() {
  return Boolean(
    elements.parentCategoryFilter.value
    || elements.childCategoryFilter.value
    || elements.subChildCategoryFilter.value
    || elements.productSearch.value.trim(),
  );
}

function toggleTableSort() {
  tableSortCriterion = "name";
  tableSortDirection = nextNameSortDirection;
  nextNameSortDirection = nextNameSortDirection === "ascending" ? "descending" : "ascending";
  updateTableSortButton();
  updateRatingSortButton();
  renderFilteredViews();
}

function updateTableSortButton() {
  elements.tableSortToggle.textContent = `Name ${capitalizeSortDirection(nextNameSortDirection)}`;
  elements.tableSortToggle.setAttribute("aria-label", `Sort visible results by name ${nextNameSortDirection}`);
  elements.tableSortToggle.setAttribute("aria-pressed", String(tableSortCriterion === "name"));
}

function toggleRatingSort() {
  tableSortCriterion = "rating";
  ratingSortDirection = nextRatingSortDirection;
  nextRatingSortDirection = nextRatingSortDirection === "ascending" ? "descending" : "ascending";
  updateRatingSortButton();
  updateTableSortButton();
  renderFilteredViews();
}

function updateRatingSortButton() {
  elements.ratingSortToggle.textContent = `Rating ${capitalizeSortDirection(nextRatingSortDirection)}`;
  elements.ratingSortToggle.setAttribute("aria-label", `Sort visible results by rating ${nextRatingSortDirection}`);
  elements.ratingSortToggle.setAttribute("aria-pressed", String(tableSortCriterion === "rating"));
}

function capitalizeSortDirection(direction) {
  return direction === "ascending" ? "Ascending" : "Descending";
}

function compareSummaryItems(first, second) {
  if (tableSortCriterion === "rating") {
    const firstRating = isNumber(first.averageRating) ? first.averageRating : first.rating;
    const secondRating = isNumber(second.averageRating) ? second.averageRating : second.rating;
    const normalizedFirstRating = isNumber(firstRating) ? firstRating : Number.NEGATIVE_INFINITY;
    const normalizedSecondRating = isNumber(secondRating) ? secondRating : Number.NEGATIVE_INFINITY;
    const comparison = normalizedFirstRating - normalizedSecondRating;
    if (comparison !== 0) {
      return ratingSortDirection === "ascending" ? comparison : -comparison;
    }
  }

  const firstName = first.name || first.productName || "";
  const secondName = second.name || second.productName || "";
  const comparison = firstName.localeCompare(secondName, undefined, { sensitivity: "base" });
  return tableSortCriterion === "name" && tableSortDirection === "descending" ? -comparison : comparison;
}

function formatDataValue(value) {
  if (!isNumber(value)) {
    return "Not available";
  }
  return new Intl.NumberFormat("en-US", {
    style: "currency",
    currency: "USD",
    maximumFractionDigits: 2,
  }).format(value);
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
    ["Average rating count", formatAverageNumber(category.averageRatingCount)],
    ["Total rating count", formatNumber(category.totalRatingCount)],
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
  const report = getVisibleReport();
  if (!report) return;

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

  [...report.categories].sort(compareSummaryItems).forEach((category) => {
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
  const report = getVisibleReport();
  if (!report) return;

  const { headers, rows } = getSummaryExportData(report);
  const csv = [headers, ...rows].map((row) => row.map(escapeCsvValue).join(",")).join("\n");
  downloadFile(csv, "product-insights-summary.csv", "text/csv;charset=utf-8");
}

function exportXlsxReport() {
  const report = getVisibleReport();
  if (!report) return;
  if (!window.XLSX) {
    setDataStatus("XLSX export is unavailable. Check your internet connection and try again.", "error");
    return;
  }

  const { headers, rows } = getSummaryExportData(report);
  const workbook = window.XLSX.utils.book_new();
  const worksheet = window.XLSX.utils.aoa_to_sheet([headers, ...rows]);
  window.XLSX.utils.book_append_sheet(workbook, worksheet, "Product Summary");
  window.XLSX.writeFile(workbook, "product-insights-summary.xlsx", { compression: true });
}

function exportRecordsText() {
  if (!currentReport) return;
  const records = getVisibleRecords();
  const lines = [
    "E-COMMERCE PRODUCT RECORDS",
    `Generated: ${new Date().toLocaleString()}`,
    `Source: ${currentReport.fileName}`,
    `Records: ${formatNumber(records.length)}`,
  ];

  records.forEach((record, index) => {
    lines.push("", `RECORD ${index + 1}`);
    RAW_EXPORT_HEADERS.forEach((header, columnIndex) => {
      lines.push(`${header}: ${getRawExportValues(record)[columnIndex]}`);
    });
  });

  downloadFile(lines.join("\n"), "filtered-product-records.txt", "text/plain;charset=utf-8");
}

function exportRecordsCsv() {
  if (!currentReport) return;
  const rows = getVisibleRecords().map(getRawExportValues);
  const csv = [RAW_EXPORT_HEADERS, ...rows].map((row) => row.map(escapeCsvValue).join(",")).join("\n");
  downloadFile(csv, "filtered-product-records.csv", "text/csv;charset=utf-8");
}

function exportRecordsXlsx() {
  if (!currentReport) return;
  if (!window.XLSX) {
    setDataStatus("XLSX export is unavailable. Check your internet connection and try again.", "error");
    return;
  }

  const rows = getVisibleRecords().map(getRawExportValues);
  const workbook = window.XLSX.utils.book_new();
  const worksheet = window.XLSX.utils.aoa_to_sheet([RAW_EXPORT_HEADERS, ...rows]);
  window.XLSX.utils.book_append_sheet(workbook, worksheet, "Filtered Records");
  window.XLSX.writeFile(workbook, "filtered-product-records.xlsx", { compression: true });
}

function getRawExportValues(record) {
  return [
    record.productId,
    record.productName,
    record.category,
    formatDataValue(record.actualPrice),
    formatDataValue(record.discountedPrice),
    record.discountPercentageRaw || "Not provided",
    record.ratingRaw || "Not provided",
    record.ratingCountRaw || "Not provided",
    record.customerReview || "Not provided",
  ];
}

function printSummary() {
  printView("summary");
}

function printRecords() {
  const wasOpen = elements.uploadedDataDetails.open;
  elements.uploadedDataDetails.open = true;
  printView("records", () => {
    elements.uploadedDataDetails.open = wasOpen;
  });
}

function printView(view, afterPrint = () => {}) {
  document.body.dataset.printView = view;
  window.addEventListener("afterprint", () => {
    delete document.body.dataset.printView;
    afterPrint();
  }, { once: true });
  window.print();
}

function getSummaryExportData(report) {
  const headers = [
    "Category", "Product Count", "Average Actual Price (USD)", "Average Discounted Price (USD)", "Average Rating", "Total Rating Count",
    "Average Discount Percentage", "Highest-Rated Product", "Lowest-Rated Product",
    "Common Praise", "Common Complaints", "Summary",
  ];
  const rows = [...report.categories].sort(compareSummaryItems).map((category) => [
    category.name,
    category.productCount,
    isNumber(category.averageActualPrice) ? formatDataValue(category.averageActualPrice) : "",
    isNumber(category.averageDiscountedPrice) ? formatDataValue(category.averageDiscountedPrice) : "",
    category.averageRating?.toFixed(2) || "",
    category.totalRatingCount,
    category.averageDiscount?.toFixed(2) || "",
    category.highestRatedProduct?.productName || "",
    category.lowestRatedProduct?.productName || "",
    category.praise,
    category.complaints,
    category.summary,
  ]);
  return { headers, rows };
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

function formatAverageNumber(value) {
  return isNumber(value)
    ? value.toLocaleString(undefined, { maximumFractionDigits: 2 })
    : "Not available";
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
  elements.datasetFile.disabled = isLoading;
  elements.loadGoogleSheet.disabled = isLoading;
  elements.googleSheetUrl.disabled = isLoading;
  elements.datasetDropZone.setAttribute("aria-disabled", String(isLoading));
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

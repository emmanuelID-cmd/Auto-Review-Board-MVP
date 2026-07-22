"use strict";

const REQUIRED_COLUMNS = [
  "Product Name",
  "Category",
  "Actual Price",
  "Discounted Price",
  "Discount Percentage",
  "Sales",
  "Rating",
  "Rating Count",
  "Customer Review",
];

const FIELD_KEYS = {
  "product name": "productName",
  category: "category",
  "actual price": "actualPrice",
  "discounted price": "discountedPrice",
  "discount percentage": "discountPercentage",
  sales: "sales",
  rating: "rating",
  "rating count": "ratingCount",
  "customer review": "customerReview",
};

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
  fileInput: document.querySelector("#csv-file"),
  dropZone: document.querySelector("#drop-zone"),
  fileRow: document.querySelector("#file-row"),
  fileName: document.querySelector("#file-name"),
  fileSize: document.querySelector("#file-size"),
  removeFile: document.querySelector("#remove-file"),
  message: document.querySelector("#message"),
  analyzeButton: document.querySelector("#analyze-button"),
  loading: document.querySelector("#loading"),
  results: document.querySelector("#results"),
  importNote: document.querySelector("#import-note"),
  overallMetrics: document.querySelector("#overall-metrics"),
  categoryCount: document.querySelector("#category-count"),
  categoryList: document.querySelector("#category-list"),
  clearButton: document.querySelector("#clear-button"),
  exportText: document.querySelector("#export-text"),
  exportCsv: document.querySelector("#export-csv"),
  printReport: document.querySelector("#print-report"),
  startDate: document.querySelector("#start-date"),
  startTime: document.querySelector("#start-time"),
  endDate: document.querySelector("#end-date"),
  endTime: document.querySelector("#end-time"),
  presentCheckbox: document.querySelector("#present-checkbox"),
  generateSummaryButton: document.querySelector("#generate-summary-button"),
  summaryMessage: document.querySelector("#summary-message"),
  startDateError: document.querySelector("#start-date-error"),
  startTimeError: document.querySelector("#start-time-error"),
  endDateError: document.querySelector("#end-date-error"),
  endTimeError: document.querySelector("#end-time-error"),
};

let selectedFile = null;
let currentReport = null;

const validationState = {
  touched: {
    startDate: false,
    startTime: false,
    endDate: false,
    endTime: false,
  },
};

elements.startDate.addEventListener("input", handleFilterInput);
elements.startDate.addEventListener("blur", () => markTouched("startDate"));
elements.startTime.addEventListener("input", handleFilterInput);
elements.startTime.addEventListener("blur", () => markTouched("startTime"));
elements.endDate.addEventListener("input", handleFilterInput);
elements.endDate.addEventListener("blur", () => markTouched("endDate"));
elements.endTime.addEventListener("input", handleFilterInput);
elements.endTime.addEventListener("blur", () => markTouched("endTime"));
elements.presentCheckbox.addEventListener("change", handlePresentToggle);
elements.generateSummaryButton.addEventListener("click", handleGenerateSummary);

elements.fileInput.addEventListener("change", (event) => {
  handleFile(event.target.files[0]);
});

["dragenter", "dragover"].forEach((eventName) => {
  elements.dropZone.addEventListener(eventName, (event) => {
    event.preventDefault();
    elements.dropZone.classList.add("is-dragging");
  });
});

["dragleave", "drop"].forEach((eventName) => {
  elements.dropZone.addEventListener(eventName, (event) => {
    event.preventDefault();
    elements.dropZone.classList.remove("is-dragging");
  });
});

elements.dropZone.addEventListener("drop", (event) => {
  handleFile(event.dataTransfer.files[0]);
});

elements.removeFile.addEventListener("click", clearSelection);
elements.clearButton.addEventListener("click", resetApplication);
elements.analyzeButton.addEventListener("click", analyzeSelectedFile);
elements.exportText.addEventListener("click", exportTextReport);
elements.exportCsv.addEventListener("click", exportCsvReport);
elements.printReport.addEventListener("click", () => window.print());

initializeDateConstraints();
validateRange();

function handleFile(file) {
  hideMessage();

  if (!file) {
    return;
  }

  if (!file.name.toLowerCase().endsWith(".csv")) {
    clearSelection();
    showMessage("Please choose a CSV file. Other file types are not supported.", "error");
    return;
  }

  if (file.size === 0) {
    clearSelection();
    showMessage("This CSV file is empty. Add product data and try again.", "error");
    return;
  }

  selectedFile = file;
  elements.fileName.textContent = file.name;
  elements.fileSize.textContent = formatFileSize(file.size);
  elements.fileRow.hidden = false;
  elements.analyzeButton.disabled = false;
}

function clearSelection() {
  selectedFile = null;
  elements.fileInput.value = "";
  elements.fileRow.hidden = true;
  elements.analyzeButton.disabled = true;
}

function resetApplication() {
  clearSelection();
  hideMessage();
  currentReport = null;
  elements.results.hidden = true;
  elements.overallMetrics.replaceChildren();
  elements.categoryList.replaceChildren();
  document.querySelector("#upload-title").scrollIntoView({ behavior: "smooth", block: "start" });
}

async function analyzeSelectedFile() {
  if (!selectedFile) {
    showMessage("Choose a CSV file before starting the analysis.", "error");
    return;
  }

  setLoading(true);
  hideMessage();

  try {
    await waitForPaint();
    const contents = await selectedFile.text();
    const parsedRows = parseCsv(contents);
    const { records, skippedRows } = validateAndNormalizeRows(parsedRows);
    currentReport = buildReport(records, skippedRows, selectedFile.name);
    renderReport(currentReport);
    showMessage(`${records.length.toLocaleString()} valid records imported successfully.`, "success");
  } catch (error) {
    currentReport = null;
    elements.results.hidden = true;
    showMessage(error.message || "The file could not be read. Check the CSV and try again.", "error");
  } finally {
    setLoading(false);
  }
}

function handleFilterInput() {
  validateRange();
}

function markTouched(fieldName) {
  validationState.touched[fieldName] = true;
  validateRange();
}

function handlePresentToggle() {
  if (elements.presentCheckbox.checked) {
    const now = new Date();
    elements.endDate.value = formatDateForInput(now);
    elements.endTime.value = formatTimeForInput(now);
    elements.endDate.disabled = true;
    elements.endTime.disabled = true;
  } else {
    elements.endDate.disabled = false;
    elements.endTime.disabled = false;
  }

  validateRange();
}

function handleGenerateSummary() {
  const result = validateRange(true);
  if (!result.valid) {
    elements.summaryMessage.textContent = "Fix the highlighted range before generating a summary.";
    elements.summaryMessage.classList.remove("success");
    elements.summaryMessage.classList.add("error");
    return;
  }

  const start = result.start;
  const end = elements.presentCheckbox.checked ? new Date() : result.end;

  if (elements.presentCheckbox.checked) {
    const now = new Date();
    elements.endDate.value = formatDateForInput(now);
    elements.endTime.value = formatTimeForInput(now);
  }

  elements.summaryMessage.textContent = `Summary generated for ${formatFriendlyDateTime(start)} through ${formatFriendlyDateTime(end)}.`;
  elements.summaryMessage.classList.remove("error");
  elements.summaryMessage.classList.add("success");
}

function initializeDateConstraints() {
  const today = new Date();
  const maxDate = formatDateForInput(today);
  elements.startDate.max = maxDate;
  elements.endDate.max = maxDate;
}

function formatDateForInput(date) {
  return date.toISOString().slice(0, 10);
}

function formatTimeForInput(date) {
  return date.toTimeString().slice(0, 5);
}

function parseDateTime(dateValue, timeValue) {
  if (!dateValue || !timeValue) {
    return null;
  }

  const parsed = new Date(`${dateValue}T${timeValue}`);
  return Number.isNaN(parsed.getTime()) ? null : parsed;
}

function isValidDateInput(value) {
  return /^\d{4}-\d{2}-\d{2}$/.test(value) && !Number.isNaN(new Date(value).getTime());
}

function isValidTimeInput(value) {
  return /^\d{2}:\d{2}$/.test(value);
}

function setFieldError(fieldElement, errorElement, message, show) {
  fieldElement.setAttribute("aria-invalid", message ? "true" : "false");
  errorElement.textContent = show && message ? message : "";
}

function validateRange(submitAttempt = false) {
  const now = new Date();
  const { startDate, startTime, endDate, endTime, presentCheckbox } = elements;
  const values = {
    startDate: startDate.value.trim(),
    startTime: startTime.value.trim(),
    endDate: endDate.value.trim(),
    endTime: endTime.value.trim(),
  };

  if (submitAttempt) {
    Object.keys(validationState.touched).forEach((key) => {
      validationState.touched[key] = true;
    });
  }

  const errors = {};
  const startDateTime = parseDateTime(values.startDate, values.startTime);
  const endDateTime = presentCheckbox.checked ? now : parseDateTime(values.endDate, values.endTime);

  if (!values.startDate) {
    errors.startDate = "Enter a Start Date.";
  } else if (!isValidDateInput(values.startDate)) {
    errors.startDate = "Enter a valid date.";
  }

  if (!values.startTime) {
    errors.startTime = "Enter a Start Time.";
  } else if (!isValidTimeInput(values.startTime)) {
    errors.startTime = "Enter a valid time.";
  }

  if (!presentCheckbox.checked) {
    if (!values.endDate) {
      errors.endDate = "Enter an End Date.";
    } else if (!isValidDateInput(values.endDate)) {
      errors.endDate = "Enter a valid date.";
    }

    if (!values.endTime) {
      errors.endTime = "Enter an End Time.";
    } else if (!isValidTimeInput(values.endTime)) {
      errors.endTime = "Enter a valid time.";
    }
  }

  if (startDateTime && startDateTime > now) {
    errors.startTime = "Start date and time cannot be in the future.";
  }

  if (!presentCheckbox.checked && endDateTime && endDateTime > now) {
    errors.endTime = "End date and time cannot be in the future.";
  }

  if (startDateTime && endDateTime && startDateTime > endDateTime) {
    errors.startTime = "Start date and time cannot be later than End date and time.";
    errors.endTime = "End date and time cannot be earlier than Start date and time.";
  }

  setFieldError(startDate, elements.startDateError, errors.startDate, validationState.touched.startDate || submitAttempt);
  setFieldError(startTime, elements.startTimeError, errors.startTime, validationState.touched.startTime || submitAttempt);
  setFieldError(endDate, elements.endDateError, errors.endDate, validationState.touched.endDate || submitAttempt);
  setFieldError(endTime, elements.endTimeError, errors.endTime, validationState.touched.endTime || submitAttempt);

  if (!submitAttempt) {
    elements.summaryMessage.textContent = "";
    elements.summaryMessage.classList.remove("success", "error");
  }

  const isRangeFilled = values.startDate && values.startTime && (presentCheckbox.checked || (values.endDate && values.endTime));
  const valid = isRangeFilled && Object.keys(errors).length === 0;
  elements.generateSummaryButton.disabled = !valid;

  return {
    valid,
    errors,
    start: startDateTime,
    end: endDateTime,
    now,
  };
}

function formatFriendlyDateTime(date) {
  return date.toLocaleString([], {
    month: "short",
    day: "numeric",
    year: "numeric",
    hour: "numeric",
    minute: "2-digit",
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
  const missingColumns = REQUIRED_COLUMNS.filter(
    (column) => !normalizedHeaders.includes(normalizeHeader(column)),
  );

  if (missingColumns.length > 0) {
    throw new Error(`Missing required column${missingColumns.length === 1 ? "" : "s"}: ${missingColumns.join(", ")}.`);
  }

  const columnIndexes = {};
  normalizedHeaders.forEach((header, index) => {
    if (FIELD_KEYS[header]) {
      columnIndexes[FIELD_KEYS[header]] = index;
    }
  });

  const records = [];
  let skippedRows = 0;

  rows.slice(1).forEach((row) => {
    const getValue = (key) => (row[columnIndexes[key]] || "").trim();
    const productName = getValue("productName");
    const category = getValue("category");

    if (!productName || !category) {
      skippedRows += 1;
      return;
    }

    records.push({
      productName,
      category,
      actualPrice: parseNumber(getValue("actualPrice")),
      discountedPrice: parseNumber(getValue("discountedPrice")),
      discountPercentage: parseNumber(getValue("discountPercentage")),
      sales: parseNumber(getValue("sales")),
      rating: clampRating(parseNumber(getValue("rating"))),
      ratingCount: parseNumber(getValue("ratingCount")),
      customerReview: getValue("customerReview"),
    });
  });

  if (records.length === 0) {
    throw new Error("No valid product records were found. Each row needs a Product Name and Category.");
  }

  return { records, skippedRows };
}

function buildReport(records, skippedRows, fileName) {
  const groupedRecords = new Map();

  records.forEach((record) => {
    const key = record.category.toLocaleLowerCase();
    if (!groupedRecords.has(key)) {
      groupedRecords.set(key, { name: record.category, records: [] });
    }
    groupedRecords.get(key).records.push(record);
  });

  const categories = Array.from(groupedRecords.values())
    .map(({ name, records: categoryRecords }) => analyzeCategory(name, categoryRecords))
    .sort((first, second) => first.name.localeCompare(second.name));

  const ratings = records.map((record) => record.rating).filter(isNumber);
  const totalSales = sum(records.map((record) => record.sales));
  const highestPerforming = [...categories].sort((a, b) => b.totalSales - a.totalSales)[0];
  const ratedCategories = categories.filter((category) => isNumber(category.averageRating));
  const lowestRated = [...ratedCategories].sort((a, b) => a.averageRating - b.averageRating)[0] || null;

  return {
    fileName,
    importedRecords: records.length,
    skippedRows,
    categoryCount: categories.length,
    overallAverageRating: average(ratings),
    overallSales: totalSales,
    highestPerformingCategory: highestPerforming,
    lowestRatedCategory: lowestRated,
    categories,
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
    totalSales: sum(records.map((record) => record.sales)),
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

  return `${category.name} has ${ratingText} across ${formatNumber(category.productCount)} products. The category generated ${formatNumber(category.totalSales)} sales and had an average discount of ${discountText}. ${praiseText}, while ${complaintText}.`;
}

function renderReport(report) {
  elements.overallMetrics.replaceChildren();
  elements.categoryList.replaceChildren();

  const skippedText = report.skippedRows > 0
    ? ` ${report.skippedRows.toLocaleString()} incomplete row${report.skippedRows === 1 ? " was" : "s were"} skipped.`
    : "";
  elements.importNote.textContent = `${report.importedRecords.toLocaleString()} records imported from ${report.fileName}.${skippedText}`;
  elements.categoryCount.textContent = `${report.categoryCount} categor${report.categoryCount === 1 ? "y" : "ies"}`;

  const overallMetrics = [
    ["Imported records", formatNumber(report.importedRecords)],
    ["Categories", formatNumber(report.categoryCount)],
    ["Average rating", formatRating(report.overallAverageRating)],
    ["Total sales", formatNumber(report.overallSales)],
    ["Top category", report.highestPerformingCategory?.name || "Not available", true],
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

  elements.results.hidden = false;
  elements.results.scrollIntoView({ behavior: "smooth", block: "start" });
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
    ["Total sales", formatNumber(category.totalSales)],
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
    `Imported records: ${formatNumber(report.importedRecords)}`,
    `Categories: ${formatNumber(report.categoryCount)}`,
    `Average rating: ${formatRating(report.overallAverageRating)}`,
    `Total sales: ${formatNumber(report.overallSales)}`,
    `Highest-performing category: ${report.highestPerformingCategory?.name || "Not available"}`,
    `Lowest-rated category: ${report.lowestRatedCategory?.name || "Not available"}`,
    "",
    "CATEGORY REPORTS",
  ];

  report.categories.forEach((category) => {
    lines.push(
      "",
      category.name.toUpperCase(),
      `Average rating: ${formatRating(category.averageRating)}`,
      `Total sales: ${formatNumber(category.totalSales)}`,
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
    "Category", "Product Count", "Total Sales", "Average Rating", "Total Rating Count",
    "Average Discount Percentage", "Highest-Rated Product", "Lowest-Rated Product",
    "Common Praise", "Common Complaints", "Summary",
  ];
  const rows = currentReport.categories.map((category) => [
    category.name,
    category.productCount,
    category.totalSales,
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

function formatFileSize(bytes) {
  if (bytes < 1024) return `${bytes} bytes`;
  if (bytes < 1024 * 1024) return `${(bytes / 1024).toFixed(1)} KB`;
  return `${(bytes / (1024 * 1024)).toFixed(1)} MB`;
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

function showMessage(message, type) {
  elements.message.textContent = message;
  elements.message.className = `message ${type}`;
  elements.message.hidden = false;
}

function hideMessage() {
  elements.message.hidden = true;
  elements.message.textContent = "";
  elements.message.className = "message";
}

function setLoading(isLoading) {
  elements.loading.hidden = !isLoading;
  elements.analyzeButton.disabled = isLoading || !selectedFile;
  elements.fileInput.disabled = isLoading;
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

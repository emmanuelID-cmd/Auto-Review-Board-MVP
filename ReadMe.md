# Auto-Review Board

A browser-based MVP that transforms e-commerce product CSV data into readable, exportable category reports.

## Features

- Automatically load the bundled Amazon dataset when the site opens.
- Use the nine approved Amazon review fields only.
- Calculate all-products and category-level performance metrics, including each applicable numeric-field average.
- Identify basic praise and complaint themes from customer reviews.
- Generate a plain-language summary for every category.
- Download the report as text, CSV, or XLSX, or print it as a PDF.
- Keep uploaded data in the browser without permanent storage.
- Replace the default with a matching CSV, XLS, XLSX, ODS, or public Google Sheet.

## Run Locally

Serve the directory with a basic web server so the browser can load `Data/amazon.csv` automatically:

```bash
python3 -m http.server 8000
```

Then visit `http://localhost:8000`.

## Imported Board Columns

The following display fields are read-only. The importer never writes back to the source CSV or changes its row values. Capitalization and extra spaces in headers are ignored; Amazon `snake_case` headers are supported. INR price values are converted in memory and displayed only as USD using the latest rate retrieved from Frankfurter.

| Board column | Data type | Accepted source headers |
| --- | --- | --- |
| Product ID | Text | `product_id` |
| Product Name | Text | `product_name` |
| Category | Text | `Category`, `category` |
| Actual Price | Decimal/currency | `actual_price` |
| Discounted Price | Decimal/currency | `discounted_price` |
| Discount Percentage | Decimal percentage | `discount_percentage` |
| Rating | Decimal, 0–5 | `rating` |
| Rating Count | Whole number | `rating_count` |
| Customer Review | Text | `review_content` |

The source CSV remains unchanged. Uploaded files are also read in the browser only. Values explicitly marked with `₹` are converted in memory to USD; uploaded prices without that marker are treated as already USD for display.

The imported-data table and summaries share Parent, Child, and Sub-Child filters. Summaries begin at the Parent level and move to the deepest selected level; product rows display only the Parent and final category segment. Category labels are formatted for readability without changing the source strings. Product Name/Product ID search and name/rating ascending/descending controls are also available. Summary cards and product rows each scroll inside their own container, with table headers kept visible. Summary and raw-record text, CSV, and XLSX exports use the active filtered and sorted results. These views do not delete or reorder source rows.

`Data/amazon.csv` is the read-only source automatically loaded by the board. A user can drag in or browse for a CSV, XLS, XLSX, or ODS file; the first worksheet is used. A public Google Sheets link can also be loaded. A custom source replaces the active board session only, and **Restore Amazon data** returns the board to the bundled dataset.

## MVP Scope

This version processes files locally and does not include accounts, database storage, live e-commerce integrations, predictive analytics, or external AI services.

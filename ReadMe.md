# Auto-Review Board

A browser-based MVP that transforms e-commerce product CSV data into readable, exportable category reports.

## Features

- Automatically load the bundled Amazon dataset when the site opens.
- Use the nine approved Amazon review fields only.
- Require all nine board fields and report missing or whitespace-only data without modifying the CSV.
- Calculate overall and category-level performance metrics.
- Identify basic praise and complaint themes from customer reviews.
- Generate a plain-language summary for every category.
- Download the report as text or CSV, or print it as a PDF.
- Keep uploaded data in the browser without permanent storage.

## Run Locally

Serve the directory with a basic web server so the browser can load `Data/amazon.csv` automatically:

```bash
python3 -m http.server 8000
```

Then visit `http://localhost:8000`.

## Imported Board Columns

The following display fields are read-only. The importer never writes back to the uploaded CSV or changes its row values. Capitalization and extra spaces in headers are ignored; Amazon `snake_case` headers are supported.

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

Data Verification reports missing/whitespace values and also counts whitespace-only values separately. The uploaded CSV remains unchanged.

The imported-data table supports Parent Category filtering, an optional Specific Category filter that depends on the selected parent, Product Name/Product ID search, and a Product Name ascending/descending toggle. It does not delete or reorder source CSV rows.

`Data/amazon.csv` is the read-only source automatically loaded by the board. There is no upload step.

## MVP Scope

This version processes files locally and does not include accounts, database storage, live e-commerce integrations, predictive analytics, or external AI services.

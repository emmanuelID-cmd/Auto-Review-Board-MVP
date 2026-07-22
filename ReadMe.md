# E-Commerce Product Insights Reporter

A browser-based MVP that transforms e-commerce product CSV data into readable, exportable category reports.

## Features

- Select or drag and drop a CSV file.
- Validate required columns and skip incomplete rows safely.
- Calculate overall and category-level performance metrics.
- Identify basic praise and complaint themes from customer reviews.
- Generate a plain-language summary for every category.
- Download the report as text or CSV, or print it as a PDF.
- Keep uploaded data in the browser without permanent storage.

## Run Locally

Open `index.html` in a browser. For the most reliable local experience, serve the directory with a basic web server:

```bash
python3 -m http.server 8000
```

Then visit `http://localhost:8000`.

## CSV Format

The CSV must include these columns. Capitalization and extra spaces in column names are ignored.

- Product Name
- Category
- Actual Price
- Discounted Price
- Discount Percentage
- Sales
- Rating
- Rating Count
- Customer Review
- Date (`YYYY-MM-DD`)
- Time (`HH:MM`)

Step 4 uses the required Date and Time fields to show uploaded records within a selected date and time range.

Use `sample-products.csv` to try the complete workflow.

## MVP Scope

This version processes files locally and does not include accounts, database storage, live e-commerce integrations, predictive analytics, or external AI services.

# Expense Hub GitHub Pages package

This folder contains the static web files for IDEA NOV OS / Finance Module / Expense Hub.

Public entry:

- `/expense-hub/`

Do not put server secrets here. Only Supabase URL and publishable/anon key may be included in `expense-hub/config.js`.

Required after publishing:

1. Add the published URL to Supabase Auth allowed redirect/site URLs.
2. Replace the NOV HUB Expense Hub link from `http://localhost:5177` to the published URL.
3. Keep LINE WORKS and AI processing inside Supabase Edge Functions.

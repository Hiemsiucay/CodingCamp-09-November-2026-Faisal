# Aruz Pengeluaran Visualizer

A mobile-friendly expense and budget visualizer built with plain HTML, CSS, and vanilla JavaScript. Track daily spending, see where your money goes, and review month-by-month trends. Everything is stored locally in the browser — no account, backend, or build step.

## Run it

Open `index.html` in a modern browser (Chrome, Firefox, Edge, or Safari).

That's it. If you prefer a local server, any static server works:

```bash
npx serve .
```

## Features

### Core
- **Add transactions** with item name, amount, date, and category.
- **Validation** for empty names, invalid or non-positive amounts, missing dates, and future dates.
- **Scrollable transaction list** with name, category, date, amount, and delete buttons.
- **Live total balance** that updates whenever transactions change.
- **Interactive spending chart** — a hand-built SVG donut/pie chart that updates automatically. Hover or tap a slice or legend row to inspect its total. No chart library or CDN required.
- **Local Storage persistence** for transactions, custom categories, sort order, and theme.

### Extra interactions
- **Monthly summary** with previous/next month navigation, monthly total, transaction count, daily average, top category, a comparison with the previous month, category progress bars, and a six-month trend chart. Tap any trend bar to jump to that month.
- **Sorting** by newest, oldest, amount high → low, amount low → high, category A → Z, or name A → Z.
- **Search** by item name or category.
- **Custom categories** with eight color choices. Duplicate names are rejected.
- **Dark/light theme toggle** that remembers your choice and follows the operating system preference until you choose explicitly.
- **Undo delete** from a confirmation toast.
- **Keyboard and screen-reader friendly** labels, focus states, live regions, and contrast-checked colors.
- Responsive layout: a two-column dashboard on desktop and a stacked, touch-friendly layout on phones.

## Project structure

```
expense-visualizer/
├── index.html          # Page structure
├── css/
│   └── styles.css      # All styling and theme tokens
├── js/
│   └── app.js          # All application logic
└── README.md
```

## Data storage

A single versioned Local Storage key is used:

```
expense-visualizer.v1
```

It contains:

```json
{
  "transactions": [
    {
      "id": "…",
      "name": "Coffee",
      "amount": 4.5,
      "category": "food",
      "date": "2026-11-13",
      "createdAt": 1763030400000
    }
  ],
  "categories": [
    { "id": "food", "name": "Food", "color": "#f97316" }
  ],
  "theme": "dark",
  "sort": "date-desc"
}
```

Clearing the site's storage removes all data. There is no server and nothing leaves the browser.

## Notes

- No frameworks, no dependencies, and no test setup.
- Dates use the browser's local time zone and are stored as `YYYY-MM-DD` to avoid time-zone shifts.
- Amounts are shown in USD via `Intl.NumberFormat`.
- Chart animations and transitions are disabled automatically for users who prefer reduced motion.

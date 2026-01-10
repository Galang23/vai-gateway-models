# AI Models Pricing Explorer

A lightweight, client-side web application for browsing and comparing AI model pricing from the [Vercel AI Gateway](https://ai-gateway.vercel.sh/).

## Features

- **Live Data**: Fetches model data directly from the Vercel AI Gateway API
- **LocalStorage Caching**: Instant page loads with stale-while-revalidate caching strategy
- **Sortable Columns**: Click any column header to sort ascending/descending
- **Advanced Filtering**:
  - Text search (Name, ID)
  - Developer filter
  - Model Family filter (auto-extracted from model names)
  - Type filter (language, image, etc.)
  - Capabilities multi-select (tool-use, vision, reasoning, etc.)
- **Pricing Display**:
  - Language models: $/1M tokens (input, output, cache read/write)
  - Image models: $/image
  - Web search: $/1k requests
- **Export Options**: Download filtered/selected data as CSV, JSON, or HTML

## Demo

Visit the live demo: [GitHub Pages](https://galang23.github.io/vai-gateway-models/).

## Usage

### Online

Simply open the deployed GitHub Pages site and start exploring AI model pricing.

### Local Development

1. Clone the repository:
   ```bash
   git clone https://github.com/YOUR_USERNAME/vercel-ai-gateway-pricing.git
   cd vercel-ai-gateway-pricing
   ```

2. Start a local server:
   ```bash
   python3 -m http.server 8080
   ```

3. Open http://localhost:8080 in your browser.

## Data Source

All pricing data is fetched from the [Vercel AI Gateway API](https://ai-gateway.vercel.sh/v1/models).

The API provides:
- Model metadata (name, ID, developer, type)
- Context window and max output tokens
- Pricing information (input, output, cache, image generation, web search)
- Capabilities/tags (tool-use, vision, reasoning, etc.)

## Tech Stack

- **HTML5**: Semantic markup
- **CSS3**: Responsive design, sticky headers, flexbox layout
- **Vanilla JavaScript**: No frameworks or dependencies
- **LocalStorage**: Client-side caching

## Files

| File | Description |
|------|-------------|
| `index.html` | Main application page |
| `style.css` | All styling (responsive, dark-mode ready structure) |
| `app.js` | Application logic (fetch, filter, sort, export) |
| `analyze_pricing.py` | Python utility script for analyzing API data |

## License

MIT License - Feel free to use and modify.

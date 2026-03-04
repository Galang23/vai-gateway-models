# AI Models Pricing Explorer

A lightweight, client-side web application for browsing and comparing AI model pricing from the [Vercel AI Gateway](https://ai-gateway.vercel.sh/).

## Features

- **Live + Local Data Source**:
  - Fetches model data directly from the Vercel AI Gateway API
  - Falls back to local `pricing.json` when API is unavailable
- **LocalStorage Caching**: Instant page loads with stale-while-revalidate caching strategy
- **Shareable Comparison Mode**:
  - Select 2+ models using row checkboxes and compare instantly (no reload)
  - Share comparison via URL query string (e.g. `?compare=modelA,modelB`)
  - Works with browser back/forward navigation
- **Advanced Filtering (Multi-select)**:
  - Text search (Name, ID)
  - Developer multi-select (checkbox dropdown)
  - Model Family multi-select (auto-extracted)
  - Type multi-select (language, image, video, etc.)
  - Capabilities multi-select (tool-use, vision, reasoning, etc.)
- **Adjustable Table Columns**:
  - Drag column edge to resize
  - Double-click column edge to auto-fit
  - Reset all custom widths with one click
- **Advanced Filtering**:
- **Pricing Display**:
  - Language models: $/1M tokens (input, output, cache read/write)
  - Image models: $/image
  - Video models: $/sec
  - Web search: $/1k requests
  - Tier/variant indicators and pricing details when available
- **Export Options**: Download filtered/selected data as CSV, JSON, or HTML (includes normalized and raw pricing data)

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

Primary data source: [Vercel AI Gateway API](https://ai-gateway.vercel.sh/v1/models).

Fallback data source: local `pricing.json`.

The API provides:
- Model metadata (name, ID, developer, type)
- Context window and max output tokens
- Pricing information (input, output, cache, image generation, video generation, web search, and tier/variant structures)
- Capabilities/tags (tool-use, vision, reasoning, etc.)

The app normalizes differing pricing schemas into a consistent table view while preserving raw pricing for export.

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
| `app.js` | Application logic (fetch, normalize, filter, compare, sort, resize, export) |
| `pricing.json` | Local fallback dataset / new schema sample |
| `analyze_pricing.py` | Python utility script for analyzing API data |

## License

MIT License - Feel free to use and modify.

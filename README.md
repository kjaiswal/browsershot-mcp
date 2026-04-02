# browsershot-mcp

Browser screenshot tool for [Claude Code](https://claude.ai/code). Take screenshots of web pages during frontend development — see what your UI looks like without leaving the terminal.

## Install

One command:

```bash
claude mcp add browsershot -- npx -y github:kjaiswal/browsershot-mcp
```

That's it. Puppeteer + Chromium are bundled — no system dependencies needed.

## What it does

Once installed, Claude Code gets three new tools:

| Tool | What it does |
|---|---|
| `screenshot` | Capture a webpage screenshot (full page or element) |
| `screenshot_compare` | Take mobile + tablet + desktop screenshots side by side |
| `page_info` | Get page metadata (fonts, colors, scroll height, resource counts) |

Claude sees the screenshots directly and can analyze layout, styling, and visual regressions.

## Usage

Just describe what you want in natural language:

```
> Take a screenshot of http://localhost:3000
> Screenshot the nav bar element on my dev server
> Compare my page at mobile, tablet, and desktop widths
> Check if dark mode looks right on localhost:8080
```

### Tool parameters

**`screenshot`**
- `url` — URL to capture (required)
- `width` / `height` — Viewport size (default: 1440×900)
- `fullPage` — Capture full scroll height (default: true)
- `selector` — CSS selector to capture a specific element
- `device` — Preset: `"mobile"`, `"tablet"`, `"desktop"`, `"4k"`, or Puppeteer device name like `"iPhone 15 Pro"`
- `darkMode` — Emulate `prefers-color-scheme: dark`
- `waitFor` — Ms to wait after load (default: 2000) or CSS selector to wait for
- `output` — Custom file path

**`screenshot_compare`**
- `url` — URL to capture (required)
- `widths` — Array of viewport widths (default: [375, 768, 1440])

**`page_info`**
- `url` — URL to inspect (required)

## Examples

Claude can now do things like:

- "Take a screenshot of my React app and tell me if the layout looks broken"
- "Screenshot this page on mobile and desktop — is the nav responsive?"
- "Check if the dark mode toggle works by screenshotting both themes"
- "What fonts and colors is this page using?"

## How it works

- Runs as an MCP (Model Context Protocol) server
- Puppeteer launches headless Chromium (bundled, no install needed)
- Screenshots are returned as images that Claude can see and analyze
- Self-signed certs are accepted (for local dev servers)
- Browser instance is reused across calls for speed

## Requirements

- Node.js 18+
- Claude Code

## License

MIT

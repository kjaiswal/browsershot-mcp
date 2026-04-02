#!/usr/bin/env node

/**
 * browsershot-mcp — Browser screenshot MCP server for Claude Code
 *
 * Provides tools to capture screenshots of web pages during frontend development.
 * Uses Puppeteer with bundled Chromium — no external browser needed.
 *
 * Install: claude mcp add browsershot -- npx -y @anthropic-community/browsershot-mcp
 */

import { Server } from "@modelcontextprotocol/sdk/server/index.js";
import { StdioServerTransport } from "@modelcontextprotocol/sdk/server/stdio.js";
import {
  CallToolRequestSchema,
  ListToolsRequestSchema,
} from "@modelcontextprotocol/sdk/types.js";
import puppeteer from "puppeteer";
import { readFileSync, mkdirSync, existsSync } from "fs";
import { join, resolve } from "path";
import { tmpdir } from "os";

const SCREENSHOT_DIR = join(tmpdir(), "browsershot-mcp");
if (!existsSync(SCREENSHOT_DIR)) mkdirSync(SCREENSHOT_DIR, { recursive: true });

let _browser = null;

async function getBrowser() {
  if (_browser && _browser.connected) return _browser;
  _browser = await puppeteer.launch({
    headless: true,
    args: [
      "--no-sandbox",
      "--disable-setuid-sandbox",
      "--ignore-certificate-errors",
      "--disable-web-security",
      "--disable-features=VizDisplayCompositor",
    ],
  });
  return _browser;
}

async function takeScreenshot({
  url,
  width = 1440,
  height = 900,
  fullPage = true,
  selector = null,
  deviceScaleFactor = 2,
  waitFor = 2000,
  darkMode = false,
  device = null,
  output = null,
}) {
  const browser = await getBrowser();
  const page = await browser.newPage();

  try {
    // Device emulation (mobile, tablet)
    if (device) {
      const devices = puppeteer.KnownDevices || puppeteer.devices;
      const deviceDesc = devices[device];
      if (deviceDesc) {
        await page.emulate(deviceDesc);
      } else {
        // Fallback presets
        const presets = {
          mobile: { width: 375, height: 812, deviceScaleFactor: 3, isMobile: true, hasTouch: true },
          tablet: { width: 768, height: 1024, deviceScaleFactor: 2, isMobile: true, hasTouch: true },
          desktop: { width: 1440, height: 900, deviceScaleFactor: 2, isMobile: false, hasTouch: false },
          "4k": { width: 3840, height: 2160, deviceScaleFactor: 1, isMobile: false, hasTouch: false },
        };
        const p = presets[device.toLowerCase()];
        if (p) {
          await page.setViewport(p);
        } else {
          await page.setViewport({ width, height, deviceScaleFactor });
        }
      }
    } else {
      await page.setViewport({ width, height, deviceScaleFactor });
    }

    // Dark mode preference
    if (darkMode) {
      await page.emulateMediaFeatures([
        { name: "prefers-color-scheme", value: "dark" },
      ]);
    }

    // Navigate
    await page.goto(url, { waitUntil: "networkidle2", timeout: 30000 });

    // Wait for content to settle
    if (typeof waitFor === "number") {
      await new Promise((r) => setTimeout(r, waitFor));
    } else if (typeof waitFor === "string") {
      // CSS selector to wait for
      await page.waitForSelector(waitFor, { timeout: 10000 });
    }

    // Screenshot options
    const screenshotOpts = { fullPage };

    if (selector) {
      const el = await page.$(selector);
      if (!el) throw new Error(`Selector "${selector}" not found on page`);
      screenshotOpts.fullPage = false;
      // Element screenshot
      const filename = `element_${Date.now()}.png`;
      const filepath = output || join(SCREENSHOT_DIR, filename);
      await el.screenshot({ path: filepath });
      return filepath;
    }

    const filename = `page_${Date.now()}.png`;
    const filepath = output || join(SCREENSHOT_DIR, filename);
    screenshotOpts.path = filepath;
    await page.screenshot(screenshotOpts);
    return filepath;
  } finally {
    await page.close();
  }
}

async function getPageInfo(url) {
  const browser = await getBrowser();
  const page = await browser.newPage();

  try {
    await page.setViewport({ width: 1440, height: 900 });
    await page.goto(url, { waitUntil: "networkidle2", timeout: 30000 });

    const info = await page.evaluate(() => ({
      title: document.title,
      url: window.location.href,
      viewport: {
        width: window.innerWidth,
        height: window.innerHeight,
        scrollHeight: document.documentElement.scrollHeight,
      },
      meta: {
        description: document.querySelector('meta[name="description"]')?.content || null,
        theme: document.querySelector('meta[name="theme-color"]')?.content || null,
      },
      fonts: [...new Set([...document.querySelectorAll("*")].map(
        (el) => getComputedStyle(el).fontFamily
      ).filter(Boolean))].slice(0, 10),
      colors: (() => {
        const bg = getComputedStyle(document.body).backgroundColor;
        const fg = getComputedStyle(document.body).color;
        return { background: bg, foreground: fg };
      })(),
      links: document.querySelectorAll("a").length,
      images: document.querySelectorAll("img").length,
      scripts: document.querySelectorAll("script").length,
      stylesheets: document.querySelectorAll('link[rel="stylesheet"]').length,
    }));

    return info;
  } finally {
    await page.close();
  }
}

async function compareScreenshots({ url, widths = [375, 768, 1440] }) {
  const results = [];
  for (const w of widths) {
    const label = w <= 480 ? "mobile" : w <= 1024 ? "tablet" : "desktop";
    const filepath = await takeScreenshot({
      url,
      width: w,
      height: w <= 480 ? 812 : w <= 1024 ? 1024 : 900,
      deviceScaleFactor: w <= 480 ? 3 : 2,
    });
    results.push({ label, width: w, path: filepath });
  }
  return results;
}

// ── MCP Server ──

const server = new Server(
  { name: "browsershot-mcp", version: "0.1.0" },
  { capabilities: { tools: {} } }
);

server.setRequestHandler(ListToolsRequestSchema, async () => ({
  tools: [
    {
      name: "screenshot",
      description:
        "Take a browser screenshot of a URL. Returns the image file path. " +
        "Use this to visually verify frontend changes, check responsive layouts, " +
        "or debug CSS issues. The returned file path can be viewed with the Read tool.",
      inputSchema: {
        type: "object",
        properties: {
          url: {
            type: "string",
            description: "URL to screenshot (http://, https://, or file://)",
          },
          width: {
            type: "number",
            description: "Viewport width in pixels (default: 1440)",
            default: 1440,
          },
          height: {
            type: "number",
            description: "Viewport height in pixels (default: 900)",
            default: 900,
          },
          fullPage: {
            type: "boolean",
            description: "Capture full scrollable page (default: true)",
            default: true,
          },
          selector: {
            type: "string",
            description: "CSS selector to screenshot a specific element instead of the full page",
          },
          device: {
            type: "string",
            description:
              'Device preset: "mobile" (375x812), "tablet" (768x1024), "desktop" (1440x900), "4k" (3840x2160), or a Puppeteer device name like "iPhone 15 Pro"',
          },
          darkMode: {
            type: "boolean",
            description: "Emulate dark mode via prefers-color-scheme: dark",
            default: false,
          },
          waitFor: {
            type: ["number", "string"],
            description:
              "Milliseconds to wait after load (default: 2000), or a CSS selector to wait for",
            default: 2000,
          },
          output: {
            type: "string",
            description: "Custom output file path (default: auto-generated in /tmp/browsershot-mcp/)",
          },
        },
        required: ["url"],
      },
    },
    {
      name: "screenshot_compare",
      description:
        "Take screenshots at multiple viewport widths to compare responsive layouts. " +
        "Returns file paths for mobile (375px), tablet (768px), and desktop (1440px) by default.",
      inputSchema: {
        type: "object",
        properties: {
          url: {
            type: "string",
            description: "URL to screenshot",
          },
          widths: {
            type: "array",
            items: { type: "number" },
            description: "Viewport widths to capture (default: [375, 768, 1440])",
            default: [375, 768, 1440],
          },
        },
        required: ["url"],
      },
    },
    {
      name: "page_info",
      description:
        "Get page metadata: title, viewport size, scroll height, fonts, colors, " +
        "and resource counts. Useful for auditing a page without a full screenshot.",
      inputSchema: {
        type: "object",
        properties: {
          url: {
            type: "string",
            description: "URL to inspect",
          },
        },
        required: ["url"],
      },
    },
  ],
}));

server.setRequestHandler(CallToolRequestSchema, async (request) => {
  const { name, arguments: args } = request.params;

  try {
    switch (name) {
      case "screenshot": {
        const filepath = await takeScreenshot(args);
        // Read the image and return as base64 for Claude to see
        const imageData = readFileSync(filepath);
        const base64 = imageData.toString("base64");
        return {
          content: [
            {
              type: "image",
              data: base64,
              mimeType: "image/png",
            },
            {
              type: "text",
              text: `Screenshot saved: ${filepath}\nViewport: ${args.width || 1440}x${args.height || 900}${args.device ? ` (${args.device})` : ""}${args.darkMode ? " [dark mode]" : ""}`,
            },
          ],
        };
      }

      case "screenshot_compare": {
        const results = await compareScreenshots(args);
        const content = [];
        for (const r of results) {
          const imageData = readFileSync(r.path);
          content.push({
            type: "image",
            data: imageData.toString("base64"),
            mimeType: "image/png",
          });
          content.push({
            type: "text",
            text: `${r.label} (${r.width}px): ${r.path}`,
          });
        }
        return { content };
      }

      case "page_info": {
        const info = await getPageInfo(args.url);
        return {
          content: [
            {
              type: "text",
              text: JSON.stringify(info, null, 2),
            },
          ],
        };
      }

      default:
        throw new Error(`Unknown tool: ${name}`);
    }
  } catch (err) {
    return {
      content: [{ type: "text", text: `Error: ${err.message}` }],
      isError: true,
    };
  }
});

// Cleanup on exit
process.on("SIGINT", async () => {
  if (_browser) await _browser.close();
  process.exit(0);
});
process.on("SIGTERM", async () => {
  if (_browser) await _browser.close();
  process.exit(0);
});

// Start
const transport = new StdioServerTransport();
await server.connect(transport);

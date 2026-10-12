import * as cheerio from "cheerio";
import { assertPublicHttpUrl, UserError } from "./urlSafety";

const MAX_REDIRECTS = 4;
const MAX_BYTES = 2 * 1024 * 1024; // 2 MB of HTML is plenty
const FETCH_TIMEOUT_MS = 10_000;
const MIN_TEXT_CHARS = 100;
const MAX_TEXT_CHARS = 15_000; // keep the AI prompt small and fast

export type ScrapeResult = { title: string; text: string; finalUrl: string };

async function readCapped(res: Response): Promise<string> {
  if (!res.body) return "";
  const reader = res.body.getReader();
  const chunks: Uint8Array[] = [];
  let total = 0;
  for (;;) {
    const { done, value } = await reader.read();
    if (done) break;
    total += value.byteLength;
    if (total > MAX_BYTES) {
      await reader.cancel();
      break; // use what we have; the main content is almost always near the top
    }
    chunks.push(value);
  }
  return new TextDecoder("utf-8").decode(Buffer.concat(chunks));
}

async function fetchHtml(startUrl: URL): Promise<{ html: string; finalUrl: string }> {
  let current = startUrl;

  for (let hop = 0; hop <= MAX_REDIRECTS; hop++) {
    let res: Response;
    try {
      res = await fetch(current, {
        redirect: "manual", // follow redirects ourselves so every hop is safety-checked
        signal: AbortSignal.timeout(FETCH_TIMEOUT_MS),
        headers: {
          "User-Agent": "Mozilla/5.0 (compatible; AISummarizerBot/1.0)",
          Accept: "text/html,application/xhtml+xml",
        },
      });
    } catch {
      throw new UserError("Could not load that page (it timed out or refused the connection).", 502);
    }

    if (res.status >= 300 && res.status < 400) {
      const location = res.headers.get("location");
      if (!location) throw new UserError("The site sent an invalid redirect.", 502);
      current = await assertPublicHttpUrl(new URL(location, current).toString());
      continue;
    }

    if (!res.ok) {
      throw new UserError(`The site responded with HTTP ${res.status}.`, 502);
    }

    const type = res.headers.get("content-type") ?? "";
    if (!/text\/html|application\/xhtml\+xml/i.test(type)) {
      throw new UserError("That URL is not an HTML web page.");
    }

    return { html: await readCapped(res), finalUrl: current.toString() };
  }

  throw new UserError("Too many redirects.", 502);
}

export function extractContent(html: string): { title: string; text: string } {
  const $ = cheerio.load(html);

  const title =
    $('meta[property="og:title"]').attr("content")?.trim() ||
    $("title").first().text().trim() ||
    $("h1").first().text().trim() ||
    "Untitled page";

  // Remove everything that is not main reading content.
  $("script, style, noscript, template, svg, canvas, iframe, form, nav, footer, header, aside, [aria-hidden='true']").remove();

  // Prefer the semantic main-content container if the page has one.
  const root = ["article", "main", "[role='main']", "#content", ".content", "body"]
    .map((selector) => $(selector).first())
    .find((el) => el.length > 0 && el.text().trim().length >= MIN_TEXT_CHARS) ?? $("body");

  // Keep paragraph breaks when flattening to text.
  root.find("br").replaceWith("\n");
  root.find("p, li, h1, h2, h3, h4, h5, h6, div, section, tr, blockquote, pre").after("\n");

  const text = root
    .text()
    .replace(/[ \t\f\v ]+/g, " ")
    .replace(/ *\n */g, "\n")
    .replace(/\n{3,}/g, "\n\n")
    .trim();

  return { title, text };
}

export async function scrapePage(rawUrl: string): Promise<ScrapeResult> {
  const url = await assertPublicHttpUrl(rawUrl);
  const { html, finalUrl } = await fetchHtml(url);
  const { title, text } = extractContent(html);

  if (text.length < MIN_TEXT_CHARS) {
    throw new UserError(
      "Couldn't find readable text on that page. It may need JavaScript to render, or it may block scrapers.",
      422,
    );
  }

  return { title, text: text.slice(0, MAX_TEXT_CHARS), finalUrl };
}

# AI Web Page Summarizer

Paste a URL, the backend scrapes the page's main text, and a free AI model (Google Gemini) returns a short summary.

- **Live demo:** _add your Vercel link here_
- **Stack:** Next.js (React frontend + API route backend), TypeScript, Cheerio for HTML parsing, Google Gemini API (free tier)

## How it works

1. The UI (`app/page.tsx`) sends `POST /api/summarize` with `{ "url": "..." }`.
2. The API route (`app/api/summarize/route.ts`) validates the URL, downloads the HTML and extracts the main readable text (`lib/scrape.ts`).
3. The text is sent to Gemini (`lib/gemini.ts`), which returns a 3 to 5 sentence summary.
4. The UI shows "Loading..." while waiting, then displays the page title, link and summary (or a clear error message).

The frontend and backend live in one Next.js project, so **one command runs both**.

## Run it locally

### Prerequisites

- Node.js 20.9 or newer (`node -v`)
- A free Gemini API key: https://aistudio.google.com/apikey

### Steps

```bash
git clone <your-repo-url>
cd ai-web-summarizer
npm install
```

Create the environment file **in the project root, next to `package.json`**, named `.env.local`:

```bash
cp .env.example .env.local
```

Then open `.env.local` and paste your key:

```
GEMINI_API_KEY=your_gemini_api_key_here
```

Start the app (frontend and backend together):

```bash
npm run dev
```

Open http://localhost:3000, paste a URL and click **Summarize**.

Never commit `.env.local`. It is already in `.gitignore`.

### Environment variables

| Variable | Required | Description |
| --- | --- | --- |
| `GEMINI_API_KEY` | Yes | Free key from Google AI Studio |
| `GEMINI_MODEL` | No | Defaults to `gemini-2.5-flash`. Set another model name if that one is retired or rate-limited |

## API

`POST /api/summarize`

```json
{ "url": "https://example.com/article" }
```

Success (200):

```json
{ "title": "Page title", "url": "https://example.com/article", "summary": "..." }
```

Errors return `{ "error": "message" }` with a suitable status: 400 (bad URL), 422 (no readable text found), 429 (rate limit), 502 (target site or AI service problem).

## Deploy (Vercel)

1. Push this project to a public GitHub repository (commit `package-lock.json` too).
2. Go to https://vercel.com/new and import the repository. The Next.js defaults work without changes.
3. Under **Environment Variables**, add `GEMINI_API_KEY` with your key.
4. Click **Deploy**, then put the live URL at the top of this README.

## Project structure

```
app/
  page.tsx                 UI: input, button, loading state, result card
  layout.tsx, globals.css  Layout and styles
  api/summarize/route.ts   Backend endpoint
lib/
  scrape.ts                Fetch HTML and extract the main text
  gemini.ts                Call the Gemini API
  urlSafety.ts             URL validation and private-network blocking
```

## Design notes

- **SSRF protection.** A server that fetches user-supplied URLs can be tricked into reading internal addresses. The backend only allows http/https on ports 80 and 443, resolves the hostname, and rejects localhost, private ranges, link-local and cloud-metadata addresses. Redirects are followed manually so every hop is re-checked.
- **Limits.** 10 second fetch timeout, 2 MB HTML cap, and the text sent to the AI is capped at 15,000 characters.
- **Prompt injection.** The page text is wrapped in tags and the model is told to treat it as content to summarize, not instructions.
- **Rate limiting.** A small in-memory limit (10 requests per minute per IP) protects the free API quota. On serverless hosting it is best-effort, because each instance keeps its own counter.

## Limitations

- Pages that need JavaScript to render their content return little text, and the app shows a clear message instead of a summary.
- Sites that block scrapers or require a login can't be summarized.
- DNS rebinding attacks are not fully covered by the address check. For a high-risk production service, fetch through an egress proxy that enforces the same rules.

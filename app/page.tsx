"use client";

import { FormEvent, useState } from "react";

type Result = { title: string; url: string; summary: string };

export default function Home() {
  const [url, setUrl] = useState("");
  const [loading, setLoading] = useState(false);
  const [result, setResult] = useState<Result | null>(null);
  const [error, setError] = useState<string | null>(null);

  async function handleSubmit(e: FormEvent) {
    e.preventDefault();
    if (loading) return;

    setLoading(true);
    setError(null);
    setResult(null);

    try {
      const res = await fetch("/api/summarize", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ url }),
      });
      const data = await res.json().catch(() => ({}));

      if (!res.ok) {
        setError(data.error ?? "Something went wrong. Please try again.");
      } else {
        setResult(data as Result);
      }
    } catch {
      setError("Could not reach the server. Check your connection and try again.");
    } finally {
      setLoading(false);
    }
  }

  return (
    <main className="container">
      <h1>AI Web Page Summarizer</h1>
      <p className="subtitle">Paste a link to an article or web page and get a short summary.</p>

      <form onSubmit={handleSubmit} className="form">
        <input
          type="text"
          inputMode="url"
          placeholder="https://example.com/some-article"
          value={url}
          onChange={(e) => setUrl(e.target.value)}
          aria-label="Web page URL"
          disabled={loading}
          required
        />
        <button type="submit" disabled={loading || !url.trim()}>
          {loading ? "Loading..." : "Summarize"}
        </button>
      </form>

      {loading && (
        <div className="status" role="status">
          <span className="spinner" aria-hidden="true" />
          Loading... fetching the page and writing the summary.
        </div>
      )}

      {error && (
        <div className="error" role="alert">
          {error}
        </div>
      )}

      {result && (
        <article className="card">
          <h2>{result.title}</h2>
          <a href={result.url} target="_blank" rel="noopener noreferrer" className="source">
            {result.url}
          </a>
          <h3>Summary</h3>
          <p className="summary">{result.summary}</p>
        </article>
      )}
    </main>
  );
}

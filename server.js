const http = require("node:http");
const fs = require("node:fs");
const path = require("node:path");

// Load a local .env file without requiring an extra package.
const envFile = path.join(__dirname, ".env");
if (fs.existsSync(envFile)) {
  for (const line of fs.readFileSync(envFile, "utf8").split(/\\r?\\n/)) {
    const match = line.match(/^\\s*([A-Za-z_][A-Za-z0-9_]*)\\s*=\\s*(.*?)\\s*$/);
    if (match && !Object.prototype.hasOwnProperty.call(process.env, match[1])) {
      process.env[match[1]] = match[2].replace(/^["']|["']$/g, "");
    }
  }
}
const PORT = Number(process.env.PORT || 3000);
const API_KEY = process.env.YOUTUBE_API_KEY || "";
const PUBLIC_DIR = path.join(__dirname, "public");

const mime = {
  ".html": "text/html; charset=utf-8",
  ".css": "text/css; charset=utf-8",
  ".js": "text/javascript; charset=utf-8",
  ".json": "application/json; charset=utf-8",
  ".svg": "image/svg+xml"
};

function send(res, status, data, type = "application/json; charset=utf-8") {
  res.writeHead(status, { "Content-Type": type, "Cache-Control": "no-store" });
  res.end(type.startsWith("application/json") ? JSON.stringify(data) : data);
}

const server = http.createServer(async (req, res) => {
  const url = new URL(req.url, `http://${req.headers.host || "localhost"}`);

  if (url.pathname === "/api/config") {
    return send(res, 200, { searchConfigured: Boolean(API_KEY) });
  }

  if (url.pathname === "/api/search") {
    if (!API_KEY) return send(res, 503, { error: "Добавь YouTube Data API v3 key в файл .env." });
    const q = (url.searchParams.get("q") || "").trim().slice(0, 100);
    if (!q) return send(res, 400, { error: "Введи запрос для поиска." });
    try {
      const endpoint = new URL("https://www.googleapis.com/youtube/v3/search");
      endpoint.search = new URLSearchParams({
        part: "snippet", type: "video", maxResults: "15", q, key: API_KEY
      }).toString();
      const response = await fetch(endpoint);
      const payload = await response.json();
      if (!response.ok) {
        return send(res, response.status, {
          error: payload?.error?.message || "YouTube API вернул ошибку. Проверь API key и квоту."
        });
      }
      const ids = (payload.items || []).map(x => x.id?.videoId).filter(Boolean);
      let durations = {};
      if (ids.length) {
        const detailsUrl = new URL("https://www.googleapis.com/youtube/v3/videos");
        detailsUrl.search = new URLSearchParams({
          part: "contentDetails,statistics", id: ids.join(","), key: API_KEY
        }).toString();
        const detailsResponse = await fetch(detailsUrl);
        if (detailsResponse.ok) {
          const details = await detailsResponse.json();
          for (const item of details.items || []) {
            durations[item.id] = {
              duration: item.contentDetails?.duration || "",
              views: item.statistics?.viewCount || ""
            };
          }
        }
      }
      const items = (payload.items || []).map(item => ({
        id: item.id.videoId,
        title: item.snippet?.title || "Без названия",
        channel: item.snippet?.channelTitle || "",
        publishedAt: item.snippet?.publishedAt || "",
        description: item.snippet?.description || "",
        thumbnail: item.snippet?.thumbnails?.high?.url || item.snippet?.thumbnails?.medium?.url || item.snippet?.thumbnails?.default?.url || "",
        ...(durations[item.id.videoId] || {})
      }));
      return send(res, 200, { items });
    } catch (error) {
      return send(res, 500, { error: "Не удалось связаться с YouTube. Попробуй ещё раз." });
    }
  }

  const requested = url.pathname === "/" ? "/index.html" : url.pathname;
  const safePath = path.normalize(path.join(PUBLIC_DIR, requested));
  if (!safePath.startsWith(PUBLIC_DIR + path.sep) && safePath !== path.join(PUBLIC_DIR, "index.html")) {
    return send(res, 403, { error: "Forbidden" });
  }
  fs.readFile(safePath, (err, data) => {
    if (err) return send(res, 404, "Not found", "text/plain; charset=utf-8");
    res.writeHead(200, { "Content-Type": mime[path.extname(safePath)] || "application/octet-stream" });
    res.end(data);
  });
});

server.listen(PORT, "0.0.0.0", () => console.log(`YT Downloader запущен на порту ${PORT}`));

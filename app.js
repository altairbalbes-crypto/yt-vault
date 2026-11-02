const $ = (selector) => document.querySelector(selector);
const searchForm = $("#searchForm");
const searchInput = $("#searchInput");
const searchButton = $("#searchButton");
const grid = $("#videoGrid");
const loader = $("#loader");
const emptyState = $("#emptyState");
const errorPanel = $("#errorPanel");
const resultsTitle = $("#resultsTitle");
const resultCount = $("#resultCount");
const dialog = $("#videoDialog");
const historyKey = "yt-vault-history-v1";
let selectedVideo = null;
let toastTimer;

function showToast(message) {
  const toast = $("#toast");
  toast.textContent = message;
  toast.classList.add("show");
  clearTimeout(toastTimer);
  toastTimer = setTimeout(() => toast.classList.remove("show"), 2800);
}
function formatDuration(iso) {
  if (!iso) return "";
  const m = iso.match(/PT(?:(\d+)H)?(?:(\d+)M)?(?:(\d+)S)?/);
  if (!m) return "";
  const h = Number(m[1] || 0), min = Number(m[2] || 0), sec = Number(m[3] || 0);
  return h ? `${h}:${String(min).padStart(2,"0")}:${String(sec).padStart(2,"0")}` : `${min}:${String(sec).padStart(2,"0")}`;
}
function safeText(value) {
  return String(value || "").replace(/[&<>"']/g, c => ({"&":"&amp;","<":"&lt;",">":"&gt;",'"':"&quot;","'":"&#39;"}[c]));
}
function setLoading(isLoading) {
  loader.classList.toggle("hidden", !isLoading);
  searchButton.disabled = isLoading;
  searchButton.querySelector("span").textContent = isLoading ? "Ищем…" : "Найти";
  if (isLoading) {
    emptyState.classList.add("hidden");
    errorPanel.classList.add("hidden");
    grid.innerHTML = "";
  }
}
async function search(query) {
  const q = query.trim();
  if (!q) return;
  setLoading(true);
  resultsTitle.textContent = `Результаты: «${q}»`;
  resultCount.textContent = "";
  try {
    const response = await fetch(`/api/search?q=${encodeURIComponent(q)}`);
    const data = await response.json();
    if (!response.ok) throw new Error(data.error || "Ошибка поиска.");
    renderResults(data.items || []);
    saveSearch(q);
  } catch (error) {
    errorPanel.textContent = error.message;
    errorPanel.classList.remove("hidden");
    emptyState.classList.add("hidden");
  } finally {
    setLoading(false);
  }
}
function renderResults(items) {
  grid.innerHTML = "";
  resultCount.textContent = `${items.length} ${items.length === 1 ? "видео" : "видео"}`;
  if (!items.length) {
    emptyState.classList.remove("hidden");
    emptyState.querySelector("h3").textContent = "Ничего не найдено";
    emptyState.querySelector("p").textContent = "Попробуй изменить поисковый запрос.";
    return;
  }
  emptyState.classList.add("hidden");
  for (const item of items) {
    const card = document.createElement("article");
    card.className = "video-card";
    card.innerHTML = `
      <div class="thumb-wrap"><img loading="lazy" src="${safeText(item.thumbnail)}" alt=""><div class="play-overlay"><span><svg viewBox="0 0 24 24"><path d="M8 5v14l11-7z"/></svg></span></div></div>
      <div class="video-meta"><h3>${safeText(item.title)}</h3><div class="channel">${safeText(item.channel)}</div><div class="video-sub">${formatDuration(item.duration) ? formatDuration(item.duration) + " · " : ""}Открыть подробности ↗</div></div>`;
    card.addEventListener("click", () => openVideo(item));
    grid.appendChild(card);
  }
}
function openVideo(item) {
  selectedVideo = item;
  $("#dialogPreview").innerHTML = `<img src="${safeText(item.thumbnail)}" alt="">`;
  $("#dialogTitle").textContent = item.title;
  $("#dialogChannel").textContent = item.channel;
  $("#youtubeLink").href = `https://www.youtube.com/watch?v=${encodeURIComponent(item.id)}`;
  $("#downloadUrl").value = "";
  $("#permissionCheck").checked = false;
  updatePermissionStatus();
  dialog.showModal();
}
function getHistory() {
  try { return JSON.parse(localStorage.getItem(historyKey) || "[]"); } catch { return []; }
}
function saveSearch(query) {
  const history = getHistory().filter(x => x.query !== query);
  history.unshift({ query, date: new Date().toISOString() });
  localStorage.setItem(historyKey, JSON.stringify(history.slice(0, 8)));
}
function addDownloadHistory(video, url) {
  const history = getHistory().filter(x => x.id !== video.id);
  history.unshift({ id: video.id, title: video.title, channel: video.channel, thumbnail: video.thumbnail, url, date: new Date().toISOString() });
  localStorage.setItem(historyKey, JSON.stringify(history.slice(0, 10)));
  renderHistory();
}
function renderHistory() {
  const list = $("#historyList");
  const history = getHistory().filter(x => x.id);
  if (!history.length) {
    list.innerHTML = '<div class="history-empty">Здесь появятся видео, которые ты сохранишь.</div>';
    return;
  }
  list.innerHTML = history.map(item => `<div class="history-row"><img src="${safeText(item.thumbnail)}" alt=""><div><b>${safeText(item.title)}</b><small>${safeText(item.channel)} · ${new Date(item.date).toLocaleDateString("ru-RU")}</small></div><a href="${safeText(item.url)}" target="_blank" rel="noopener noreferrer">Ссылка ↗</a></div>`).join("");
}
async function checkConfig() {
  try {
    const response = await fetch("/api/config");
    const data = await response.json();
    $("#apiStatus").textContent = data.searchConfigured ? "Поиск подключён" : "Нужен API key";
    $("#apiStatus").previousElementSibling.style.background = data.searchConfigured ? "#55c987" : "#d69a37";
    if (!data.searchConfigured) {
      emptyState.querySelector("p").textContent = "Добавь YouTube Data API key в .env — инструкция есть в README.";
    }
  } catch {
    $("#apiStatus").textContent = "Сервер недоступен";
  }
}
searchForm.addEventListener("submit", event => { event.preventDefault(); search(searchInput.value); });
$("#closeDialog").addEventListener("click", () => dialog.close());
dialog.addEventListener("click", event => { if (event.target === dialog) dialog.close(); });
function updatePermissionStatus() {
  const confirmed = $("#permissionCheck").checked;
  const hasUrl = Boolean($("#downloadUrl").value.trim());
  const status = $("#permissionStatus");
  status.textContent = confirmed ? "✓ Можно скачать — разрешение подтверждено тобой" : "⚠️ Разрешение не проверено";
  status.classList.toggle("allowed", confirmed);
  $("#downloadButton").disabled = !(confirmed && hasUrl);
}
$("#permissionCheck").addEventListener("change", updatePermissionStatus);
$("#downloadUrl").addEventListener("input", updatePermissionStatus);
$("#downloadButton").addEventListener("click", () => {
  const raw = $("#downloadUrl").value.trim();
  if (!selectedVideo) return;
  if (!$("#permissionCheck").checked) { showToast("Сначала подтверди разрешение на скачивание."); return; }
  let parsed;
  try { parsed = new URL(raw); } catch { showToast("Вставь корректную прямую ссылку на файл."); return; }
  if (!["http:", "https:"].includes(parsed.protocol)) { showToast("Поддерживаются только HTTP и HTTPS ссылки."); return; }
  // A creator-provided direct media URL is opened as a normal browser download/navigation.
  const link = document.createElement("a");
  link.href = parsed.href;
  link.target = "_blank";
  link.rel = "noopener noreferrer";
  link.download = "";
  document.body.appendChild(link);
  link.click();
  link.remove();
  addDownloadHistory(selectedVideo, parsed.href);
  showToast("Ссылка открыта. Если файл не скачался, проверь настройки источника.");
  dialog.close();
});
$("#clearHistory").addEventListener("click", () => {
  const history = getHistory().filter(x => !x.id);
  localStorage.setItem(historyKey, JSON.stringify(history));
  renderHistory();
  showToast("История загрузок очищена.");
});
renderHistory();
checkConfig();
const directDownloadForm = $("#directDownloadForm");
if (directDownloadForm) {
  const directUrlInput = $("#directVideoUrl");
  const directPermission = $("#directPermissionCheck");
  const directStatus = $("#directDownloadStatus");
  directDownloadForm.addEventListener("submit", event => {
    event.preventDefault();
    const raw = directUrlInput.value.trim();
    if (!directPermission.checked) { directStatus.textContent = "⚠️ Подтверди, что у тебя есть право скачивать этот файл."; directStatus.classList.remove("allowed"); return; }
    let parsed;
    try { parsed = new URL(raw); } catch { directStatus.textContent = "⚠️ Вставь корректную прямую ссылку на видеофайл."; directStatus.classList.remove("allowed"); return; }
    if (!["http:","https:"].includes(parsed.protocol) || !/\.(mp4|mov|m4v|webm)(?:$|[?#])/i.test(parsed.pathname + parsed.search)) { directStatus.textContent = "⚠️ Нужна прямая ссылка на видеофайл (например, .mp4), а не обычная ссылка YouTube."; directStatus.classList.remove("allowed"); return; }
    directStatus.textContent = "✓ Разрешение подтверждено. Открываем файл для сохранения на устройство."; directStatus.classList.add("allowed");
    const link = document.createElement("a"); link.href = parsed.href; link.target = "_blank"; link.rel = "noopener noreferrer"; link.download = ""; document.body.appendChild(link); link.click(); link.remove();
    showToast("Открыл ссылку на видеофайл. На iPhone используй «Поделиться» → «Сохранить видео».");
  });
}

const youtubeUrlForm = $("#youtubeUrlForm");
if (youtubeUrlForm) {
  const youtubeInput = $("#youtubeVideoUrl");
  const youtubeStatus = $("#youtubeUrlStatus");
  const youtubeOpen = $("#youtubeUrlOpen");
  youtubeUrlForm.addEventListener("submit", event => {
    event.preventDefault();
    let parsed;
    try { parsed = new URL(youtubeInput.value.trim()); } catch {
      youtubeStatus.textContent = "⚠️ Вставь корректную ссылку YouTube.";
      youtubeOpen.classList.add("hidden");
      return;
    }
    const host = parsed.hostname.replace(/^www\./, "").replace(/^m\./, "");
    let videoId = "";
    if (host === "youtu.be") videoId = parsed.pathname.split("/").filter(Boolean)[0] || "";
    else if (["youtube.com", "music.youtube.com"].includes(host)) {
      if (parsed.pathname === "/watch") videoId = parsed.searchParams.get("v") || "";
      else if (/^\/(shorts|embed|live)\//.test(parsed.pathname)) videoId = parsed.pathname.split("/")[2] || "";
    }
    if (!/^[A-Za-z0-9_-]{11}$/.test(videoId)) {
      youtubeStatus.textContent = "⚠️ Не удалось распознать ссылку. Подойдут youtube.com/watch?v=…, youtu.be/… и YouTube Shorts.";
      youtubeOpen.classList.add("hidden");
      return;
    }
    const canonicalUrl = `https://www.youtube.com/watch?v=${videoId}`;
    youtubeOpen.href = canonicalUrl;
    youtubeOpen.classList.remove("hidden");
    youtubeStatus.textContent = "✓ Ссылка распознана. Открыть видео можно на YouTube. Обычная ссылка не является MP4-файлом и сама по себе не даёт возможности скачать ролик в Фото.";
  });
}

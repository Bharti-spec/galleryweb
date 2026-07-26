const token = localStorage.getItem("gallery_token");
const userRaw = localStorage.getItem("gallery_user");

if (!token || !userRaw) {
  window.location.href = "index.html";
}

const user = JSON.parse(userRaw);
document.getElementById("userName").textContent = user.name;

// ---------- DOM references ----------

const tabButtons = document.querySelectorAll(".tab-btn");
const galleryView = document.getElementById("galleryView");
const albumsView = document.getElementById("albumsView");
const trashView = document.getElementById("trashView");

const albumHeader = document.getElementById("albumHeader");
const albumHeaderName = document.getElementById("albumHeaderName");
const backToAlbums = document.getElementById("backToAlbums");
const shareAlbumBtn = document.getElementById("shareAlbumBtn");

const emptyState = document.getElementById("emptyState");
const galleryGroups = document.getElementById("galleryGroups");

const albumsEmptyState = document.getElementById("albumsEmptyState");
const albumsGrid = document.getElementById("albumsGrid");
const newAlbumBtn = document.getElementById("newAlbumBtn");

const trashEmptyState = document.getElementById("trashEmptyState");
const trashGrid = document.getElementById("trashGrid");

const uploadFab = document.getElementById("uploadFab");
const fileInput = document.getElementById("fileInput");
const uploadProgress = document.getElementById("uploadProgress");
const uploadProgressFill = document.getElementById("uploadProgressFill");
const uploadProgressText = document.getElementById("uploadProgressText");

const storageMeter = document.getElementById("storageMeter");
const loadMoreIndicator = document.getElementById("loadMoreIndicator");

const lightbox = document.getElementById("lightbox");
const lightboxContent = document.getElementById("lightboxContent");
const lightboxClose = document.getElementById("lightboxClose");
const lightboxDelete = document.getElementById("lightboxDelete");
const lightboxDownload = document.getElementById("lightboxDownload");
const lightboxAlbum = document.getElementById("lightboxAlbum");
const lightboxRestore = document.getElementById("lightboxRestore");
const lightboxFavorite = document.getElementById("lightboxFavorite");
const lightboxShare = document.getElementById("lightboxShare");

const selectModeBtn = document.getElementById("selectModeBtn");
const selectionBar = document.getElementById("selectionBar");
const selectionCount = document.getElementById("selectionCount");
const selectAllBtn = document.getElementById("selectAllBtn");
const bulkDownloadBtn = document.getElementById("bulkDownloadBtn");
const bulkAlbumBtn = document.getElementById("bulkAlbumBtn");
const bulkFavoriteBtn = document.getElementById("bulkFavoriteBtn");
const bulkTrashBtn = document.getElementById("bulkTrashBtn");
const bulkRestoreBtn = document.getElementById("bulkRestoreBtn");
const bulkPermanentDeleteBtn = document.getElementById("bulkPermanentDeleteBtn");
const cancelSelectBtn = document.getElementById("cancelSelectBtn");

const downloadProgress = document.getElementById("downloadProgress");
const downloadProgressFill = document.getElementById("downloadProgressFill");
const downloadProgressText = document.getElementById("downloadProgressText");

const albumModal = document.getElementById("albumModal");
const albumModalTitle = document.getElementById("albumModalTitle");
const albumModalList = document.getElementById("albumModalList");
const newAlbumForm = document.getElementById("newAlbumForm");
const newAlbumName = document.getElementById("newAlbumName");
const albumModalClose = document.getElementById("albumModalClose");

const shareModal = document.getElementById("shareModal");
const shareLinkInput = document.getElementById("shareLinkInput");
const copyShareLinkBtn = document.getElementById("copyShareLinkBtn");
const revokeShareBtn = document.getElementById("revokeShareBtn");
const shareModalClose = document.getElementById("shareModalClose");

// ---------- state ----------

let currentTab = "gallery"; // 'gallery' | 'favorites' | 'albums' | 'trash'
let currentAlbumId = null;
let allMedia = [];
let selectMode = false;
let selectedIds = new Set();
let currentItem = null;
let assignTargetIds = null; // ids being assigned to an album via the modal
let shareContext = null; // { kind: 'media'|'album', id }

const PAGE_SIZE = 60;
let currentPage = 1;
let hasMoreMedia = true;
let isLoadingMore = false;
let trashPage = 1;
let hasMoreTrash = true;
let isLoadingMoreTrash = false;

// ---------- helpers ----------

async function authFetch(url, options = {}) {
  const res = await fetch(url, {
    ...options,
    headers: {
      ...(options.headers || {}),
      Authorization: `Bearer ${token}`,
    },
  });

  if (res.status === 401) {
    localStorage.removeItem("gallery_token");
    localStorage.removeItem("gallery_user");
    window.location.href = "index.html";
    throw new Error("Session expired");
  }

  return res;
}

async function authJson(url, options = {}) {
  return authFetch(url, {
    ...options,
    headers: {
      "Content-Type": "application/json",
      ...(options.headers || {}),
    },
  });
}

function escapeHtml(str) {
  const div = document.createElement("div");
  div.textContent = str;
  return div.innerHTML;
}

function dateLabel(dateStr) {
  const d = new Date(dateStr);
  const today = new Date();
  const yesterday = new Date();
  yesterday.setDate(today.getDate() - 1);

  const sameDay = (a, b) =>
    a.getDate() === b.getDate() && a.getMonth() === b.getMonth() && a.getFullYear() === b.getFullYear();

  if (sameDay(d, today)) return "Today";
  if (sameDay(d, yesterday)) return "Yesterday";

  const sameYear = d.getFullYear() === today.getFullYear();
  return d.toLocaleDateString("en-IN", {
    day: "numeric",
    month: "long",
    year: sameYear ? undefined : "numeric",
  });
}

function groupByDate(mediaList, dateField) {
  const groups = [];
  const map = new Map();

  mediaList.forEach((item) => {
    const label = dateLabel(item[dateField]);
    if (!map.has(label)) {
      map.set(label, []);
      groups.push(label);
    }
    map.get(label).push(item);
  });

  return groups.map((label) => ({ label, items: map.get(label) }));
}

function formatBytes(bytes) {
  if (!bytes || bytes === 0) return "0 MB";
  const gb = bytes / (1024 * 1024 * 1024);
  if (gb >= 1) return `${gb.toFixed(1)} GB used`;
  const mb = bytes / (1024 * 1024);
  return `${mb.toFixed(0)} MB used`;
}

async function loadStorageMeter() {
  try {
    const res = await authFetch("/api/media/storage");
    const data = await res.json();
    storageMeter.textContent = formatBytes(data.totalBytes);
  } catch (err) {
    storageMeter.textContent = "";
  }
}

// ---------- tab switching ----------

tabButtons.forEach((btn) => {
  btn.addEventListener("click", () => switchTab(btn.dataset.tab));
});

function switchTab(tab) {
  if (selectMode) exitSelectMode();

  currentTab = tab;
  currentAlbumId = null;
  tabButtons.forEach((b) => b.classList.toggle("active", b.dataset.tab === tab));

  galleryView.hidden = !(tab === "gallery" || tab === "favorites");
  albumsView.hidden = tab !== "albums";
  trashView.hidden = tab !== "trash";
  albumHeader.hidden = true;

  uploadFab.hidden = tab !== "gallery";

  if (tab === "gallery") {
    loadGallery();
  } else if (tab === "favorites") {
    loadFavorites();
  } else if (tab === "albums") {
    loadAlbums();
  } else if (tab === "trash") {
    loadTrash();
  }
}

backToAlbums.addEventListener("click", () => switchTab("albums"));

// ---------- gallery (main + album detail) ----------

async function loadGallery() {
  currentPage = 1;
  hasMoreMedia = true;
  allMedia = [];
  await loadMoreGalleryItems();
}

async function loadFavorites() {
  currentPage = 1;
  hasMoreMedia = true;
  allMedia = [];
  await loadMoreGalleryItems();
}

async function loadMoreGalleryItems() {
  if (!hasMoreMedia || isLoadingMore) return;
  isLoadingMore = true;
  loadMoreIndicator.hidden = false;

  const params = new URLSearchParams();
  if (currentAlbumId) params.set("albumId", currentAlbumId);
  if (currentTab === "favorites") params.set("favorite", "true");
  params.set("page", currentPage);
  params.set("limit", PAGE_SIZE);

  const res = await authFetch(`/api/media?${params.toString()}`);
  const data = await res.json();

  allMedia = allMedia.concat(data.media || []);
  hasMoreMedia = !!data.hasMore;
  currentPage++;
  isLoadingMore = false;
  loadMoreIndicator.hidden = true;

  renderGalleryGroups();
}

function renderGalleryGroups() {
  emptyState.hidden = allMedia.length > 0;
  galleryGroups.innerHTML = "";

  const groups = groupByDate(allMedia, "createdAt");

  groups.forEach((group) => {
    const wrap = document.createElement("div");
    wrap.className = "date-group";

    const label = document.createElement("p");
    label.className = "date-group-label";
    label.textContent = group.label;
    wrap.appendChild(label);

    const grid = document.createElement("div");
    grid.className = "gallery-grid";
    group.items.forEach((item) => grid.appendChild(buildCell(item, currentTab === "favorites" ? "favorites" : "gallery")));
    wrap.appendChild(grid);

    galleryGroups.appendChild(wrap);
  });
}

function getVideoThumbnailUrl(url) {
  // Cloudinary can generate a still-frame JPG straight from a video asset —
  // just swap the file extension. This is far lighter than loading the full
  // video, and avoids the browser hitting its per-page connection limit when
  // many videos try to load in the grid at once (which was silently
  // "blocking" some videos from ever rendering).
  return url.replace(/\.\w+(\?.*)?$/, ".jpg$1");
}

function buildCell(item, context) {
  const cell = document.createElement("div");
  cell.className = "grid-item";
  if (selectMode) cell.classList.add("selectable");
  if (selectedIds.has(item._id)) cell.classList.add("selected");
  cell.dataset.id = item._id;

  if (item.type === "video") {
    const img = document.createElement("img");
    img.src = getVideoThumbnailUrl(item.url);
    img.loading = "lazy";
    cell.appendChild(img);

    const badge = document.createElement("div");
    badge.className = "video-badge";
    badge.innerHTML = `<svg width="12" height="12" viewBox="0 0 24 24" fill="currentColor"><path d="M8 5v14l11-7z"/></svg>`;
    cell.appendChild(badge);
  } else {
    const img = document.createElement("img");
    img.src = item.url;
    img.loading = "lazy";
    cell.appendChild(img);
  }

  if (selectMode) {
    const checkbox = document.createElement("div");
    checkbox.className = "item-checkbox";
    cell.appendChild(checkbox);
  } else if (context !== "trash") {
    const star = document.createElement("div");
    star.className = "favorite-badge" + (item.favorite ? " active" : "");
    star.innerHTML = "&#9733;";
    star.addEventListener("click", (e) => {
      e.stopPropagation();
      toggleFavoriteQuick(item, star, context);
    });
    cell.appendChild(star);
  }

  cell.addEventListener("click", () => {
    if (selectMode) {
      toggleItemSelection(item._id, cell);
    } else {
      openLightbox(item, context);
    }
  });

  let pressTimer;
  cell.addEventListener("touchstart", () => {
    pressTimer = setTimeout(() => {
      if (!selectMode) enterSelectMode();
      toggleItemSelection(item._id, cell);
    }, 500);
  });
  cell.addEventListener("touchend", () => clearTimeout(pressTimer));
  cell.addEventListener("touchmove", () => clearTimeout(pressTimer));

  return cell;
}

async function toggleFavoriteQuick(item, starEl, context) {
  const newValue = !item.favorite;
  await authJson(`/api/media/${item._id}/favorite`, {
    method: "PATCH",
    body: JSON.stringify({ favorite: newValue }),
  });
  item.favorite = newValue;

  if (context === "favorites" && !newValue) {
    // removed from favorites while viewing the favorites tab — drop it from view
    allMedia = allMedia.filter((m) => m._id !== item._id);
    renderGalleryGroups();
  } else {
    starEl.classList.toggle("active", newValue);
  }
}

function renderCurrentView() {
  if (currentTab === "gallery" || currentTab === "favorites") renderGalleryGroups();
  else if (currentTab === "trash") renderTrashGroups();
}

// ---------- albums ----------

async function loadAlbums() {
  const res = await authFetch("/api/albums");
  const data = await res.json();
  const albums = data.albums || [];

  albumsEmptyState.hidden = albums.length > 0;
  albumsGrid.innerHTML = "";

  albums.forEach((album) => {
    const card = document.createElement("div");
    card.className = "album-card";

    const cover = document.createElement("div");
    cover.className = "album-cover";
    if (album.coverUrl) {
      const img = document.createElement("img");
      img.src = album.coverType === "video" ? getVideoThumbnailUrl(album.coverUrl) : album.coverUrl;
      cover.appendChild(img);
    } else {
      const placeholder = document.createElement("span");
      placeholder.className = "album-cover-placeholder";
      placeholder.textContent = "Empty";
      cover.appendChild(placeholder);
    }

    const optionsBtn = document.createElement("button");
    optionsBtn.className = "album-options-btn";
    optionsBtn.innerHTML = "&#8942;";
    optionsBtn.setAttribute("aria-label", "Album options");

    const optionsMenu = document.createElement("div");
    optionsMenu.className = "album-options-menu";
    optionsMenu.hidden = true;

    const renameItem = document.createElement("button");
    renameItem.textContent = "Rename";
    renameItem.addEventListener("click", async (e) => {
      e.stopPropagation();
      optionsMenu.hidden = true;
      const newName = prompt("Album ka naya naam:", album.name);
      if (!newName || !newName.trim() || newName.trim() === album.name) return;

      await authJson(`/api/albums/${album._id}`, {
        method: "PATCH",
        body: JSON.stringify({ name: newName.trim() }),
      });
      loadAlbums();
    });

    const deleteItem = document.createElement("button");
    deleteItem.textContent = "Delete album";
    deleteItem.className = "danger";
    deleteItem.addEventListener("click", async (e) => {
      e.stopPropagation();
      optionsMenu.hidden = true;
      if (!confirm(`"${album.name}" album delete kar dein? Photos/videos gallery mein wapas aa jayengi, kuch delete nahi hoga.`)) return;

      await authFetch(`/api/albums/${album._id}`, { method: "DELETE" });
      loadAlbums();
    });

    optionsMenu.appendChild(renameItem);
    optionsMenu.appendChild(deleteItem);

    optionsBtn.addEventListener("click", (e) => {
      e.stopPropagation();
      document.querySelectorAll(".album-options-menu").forEach((m) => {
        if (m !== optionsMenu) m.hidden = true;
      });
      optionsMenu.hidden = !optionsMenu.hidden;
    });

    cover.appendChild(optionsBtn);
    cover.appendChild(optionsMenu);

    const info = document.createElement("div");
    info.className = "album-info";
    info.innerHTML = `<h3>${escapeHtml(album.name)}</h3><span>${album.count} item${album.count === 1 ? "" : "s"}</span>`;

    card.appendChild(cover);
    card.appendChild(info);

    card.addEventListener("click", () => openAlbum(album._id, album.name));

    albumsGrid.appendChild(card);
  });
}

// Close any open album options menu when clicking elsewhere on the page
document.addEventListener("click", () => {
  document.querySelectorAll(".album-options-menu").forEach((m) => (m.hidden = true));
});

function openAlbum(albumId, albumName) {
  currentAlbumId = albumId;
  currentTab = "gallery";
  tabButtons.forEach((b) => b.classList.toggle("active", b.dataset.tab === "gallery"));
  galleryView.hidden = false;
  albumsView.hidden = true;
  trashView.hidden = true;
  uploadFab.hidden = false;

  albumHeader.hidden = false;
  albumHeaderName.textContent = albumName;

  loadGallery();
}

newAlbumBtn.addEventListener("click", () => openAlbumModal(null));

shareAlbumBtn.addEventListener("click", async () => {
  if (!currentAlbumId) return;
  const res = await authJson(`/api/albums/${currentAlbumId}/share`, { method: "POST" });
  const data = await res.json();
  shareContext = { kind: "album", id: currentAlbumId };
  openShareModal(`${window.location.origin}/share.html?type=album&token=${data.shareToken}`);
});

// ---------- trash ----------

async function loadTrash() {
  trashPage = 1;
  hasMoreTrash = true;
  allMedia = [];
  await loadMoreTrashItems();
}

async function loadMoreTrashItems() {
  if (!hasMoreTrash || isLoadingMoreTrash) return;
  isLoadingMoreTrash = true;
  loadMoreIndicator.hidden = false;

  const params = new URLSearchParams();
  params.set("page", trashPage);
  params.set("limit", PAGE_SIZE);

  const res = await authFetch(`/api/media/trash?${params.toString()}`);
  const data = await res.json();

  allMedia = allMedia.concat(data.media || []);
  hasMoreTrash = !!data.hasMore;
  trashPage++;
  isLoadingMoreTrash = false;
  loadMoreIndicator.hidden = true;

  renderTrashGroups();
}

function renderTrashGroups() {
  trashEmptyState.hidden = allMedia.length > 0;
  trashGrid.innerHTML = "";
  allMedia.forEach((item) => trashGrid.appendChild(buildCell(item, "trash")));
}

// ---------- select mode ----------

selectModeBtn.addEventListener("click", () => {
  if (selectMode) exitSelectMode();
  else enterSelectMode();
});
cancelSelectBtn.addEventListener("click", exitSelectMode);

function enterSelectMode() {
  selectMode = true;
  selectedIds.clear();
  selectModeBtn.textContent = "Cancel";
  selectionBar.hidden = false;
  uploadFab.hidden = true;
  document.querySelector(".gallery-main").classList.add("has-selection-bar");

  const isTrash = currentTab === "trash";
  bulkDownloadBtn.hidden = isTrash;
  bulkAlbumBtn.hidden = isTrash;
  bulkTrashBtn.hidden = isTrash;
  bulkFavoriteBtn.hidden = isTrash;
  bulkFavoriteBtn.textContent = currentTab === "favorites" ? "Remove favorite" : "\u2605 Favorite";
  bulkRestoreBtn.hidden = !isTrash;
  bulkPermanentDeleteBtn.hidden = !isTrash;

  renderCurrentView();
  updateSelectionCount();
}

function exitSelectMode() {
  selectMode = false;
  selectedIds.clear();
  selectModeBtn.textContent = "Select";
  selectionBar.hidden = true;
  uploadFab.hidden = currentTab !== "gallery";
  document.querySelector(".gallery-main").classList.remove("has-selection-bar");
  renderCurrentView();
}

function toggleItemSelection(id, cell) {
  if (selectedIds.has(id)) {
    selectedIds.delete(id);
    cell.classList.remove("selected");
  } else {
    selectedIds.add(id);
    cell.classList.add("selected");
  }
  updateSelectionCount();
}

function updateSelectionCount() {
  selectionCount.textContent = `${selectedIds.size} selected`;
}

selectAllBtn.addEventListener("click", () => {
  allMedia.forEach((item) => selectedIds.add(item._id));
  renderCurrentView();
  updateSelectionCount();
});

// ---------- download ----------

function getDownloadUrl(item) {
  // Cloudinary's fl_attachment flag makes the CDN itself send the file with
  // a Content-Disposition: attachment header, so the browser downloads it
  // natively and streams it straight to disk. Previously we fetched the
  // whole file into JS memory first (fetch + blob) — for large videos on a
  // flaky connection, that could produce an incomplete/corrupt file (missing
  // audio, playback errors). This avoids that entirely.
  return item.url.replace("/upload/", "/upload/fl_attachment/");
}

function downloadFile(item) {
  const a = document.createElement("a");
  a.href = getDownloadUrl(item);
  if (item.originalName) a.download = item.originalName;
  document.body.appendChild(a);
  a.click();
  a.remove();
}

bulkDownloadBtn.addEventListener("click", async () => {
  const items = allMedia.filter((m) => selectedIds.has(m._id));
  if (items.length === 0) return;

  downloadProgress.hidden = false;
  downloadProgressFill.style.width = "0%";
  downloadProgressText.textContent = `Starting ${items.length} download${items.length > 1 ? "s" : ""}…`;

  // Each click hands the file off to the browser's own download manager,
  // which then downloads it in the background — so we just need to trigger
  // them a bit apart (rather than all at once) so the browser doesn't drop
  // any of the clicks.
  for (let i = 0; i < items.length; i++) {
    downloadFile(items[i]);
    downloadProgressFill.style.width = `${Math.round(((i + 1) / items.length) * 100)}%`;
    downloadProgressText.textContent = `Started ${i + 1} of ${items.length}…`;
    await new Promise((r) => setTimeout(r, 500));
  }

  downloadProgressText.textContent = "Check your browser's downloads for progress.";
  setTimeout(() => (downloadProgress.hidden = true), 2500);
});

// ---------- favorite (bulk) ----------

bulkFavoriteBtn.addEventListener("click", async () => {
  if (selectedIds.size === 0) return;
  const makeFavorite = currentTab !== "favorites";

  await authJson("/api/media/bulk/favorite", {
    method: "PATCH",
    body: JSON.stringify({ ids: Array.from(selectedIds), favorite: makeFavorite }),
  });

  exitSelectMode();
  if (currentTab === "favorites") loadFavorites();
  else loadGallery();
});

// ---------- trash / delete actions ----------

bulkTrashBtn.addEventListener("click", async () => {
  if (selectedIds.size === 0) return;
  if (!confirm(`${selectedIds.size} item(s) trash mein bhej dein?`)) return;

  await authJson("/api/media/bulk/trash", {
    method: "POST",
    body: JSON.stringify({ ids: Array.from(selectedIds) }),
  });

  exitSelectMode();
  if (currentTab === "favorites") loadFavorites();
  else loadGallery();
});

bulkRestoreBtn.addEventListener("click", async () => {
  if (selectedIds.size === 0) return;

  await authJson("/api/media/bulk/restore", {
    method: "POST",
    body: JSON.stringify({ ids: Array.from(selectedIds) }),
  });

  exitSelectMode();
  loadTrash();
});

bulkPermanentDeleteBtn.addEventListener("click", async () => {
  if (selectedIds.size === 0) return;
  if (!confirm(`${selectedIds.size} item(s) HAMESHA ke liye delete kar dein? Ye wapas nahi aa sakta.`)) return;

  await authJson("/api/media/bulk/permanent", {
    method: "DELETE",
    body: JSON.stringify({ ids: Array.from(selectedIds) }),
  });

  exitSelectMode();
  loadTrash();
});

// ---------- album assignment (modal) ----------

bulkAlbumBtn.addEventListener("click", () => {
  if (selectedIds.size === 0) return;
  openAlbumModal(Array.from(selectedIds));
});

async function openAlbumModal(ids) {
  assignTargetIds = ids;
  albumModalTitle.textContent = ids ? "Add to album" : "New album";
  albumModalList.innerHTML = "";
  newAlbumName.value = "";

  if (ids) {
    const res = await authFetch("/api/albums");
    const data = await res.json();
    (data.albums || []).forEach((album) => {
      const row = document.createElement("div");
      row.className = "modal-album-item";
      row.innerHTML = `<span>${escapeHtml(album.name)}</span><span class="count">${album.count}</span>`;
      row.addEventListener("click", () => assignToAlbum(album._id));
      albumModalList.appendChild(row);
    });
  }

  albumModal.hidden = false;
}

async function assignToAlbum(albumId) {
  await authJson("/api/media/bulk/album", {
    method: "PATCH",
    body: JSON.stringify({ ids: assignTargetIds, albumId }),
  });

  albumModal.hidden = true;
  exitSelectMode();

  if (currentTab === "gallery") loadGallery();
  else if (currentTab === "favorites") loadFavorites();
}

albumModalClose.addEventListener("click", () => (albumModal.hidden = true));
albumModal.addEventListener("click", (e) => {
  if (e.target === albumModal) albumModal.hidden = true;
});

newAlbumForm.addEventListener("submit", async (e) => {
  e.preventDefault();
  const name = newAlbumName.value.trim();
  if (!name) return;

  const res = await authJson("/api/albums", {
    method: "POST",
    body: JSON.stringify({ name }),
  });
  const data = await res.json();

  if (assignTargetIds) {
    await assignToAlbum(data.album._id);
  } else {
    albumModal.hidden = true;
    loadAlbums();
  }
});

// ---------- share link modal ----------

function openShareModal(url) {
  shareLinkInput.value = url;
  copyShareLinkBtn.textContent = "Copy";
  shareModal.hidden = false;
}

copyShareLinkBtn.addEventListener("click", async () => {
  try {
    await navigator.clipboard.writeText(shareLinkInput.value);
  } catch (err) {
    shareLinkInput.select();
    document.execCommand("copy");
  }
  copyShareLinkBtn.textContent = "Copied!";
  setTimeout(() => (copyShareLinkBtn.textContent = "Copy"), 1500);
});

revokeShareBtn.addEventListener("click", async () => {
  if (!shareContext) return;
  if (!confirm("Ye link band kar dein? Jiske paas ye link hai, wo ab nahi dekh payega.")) return;

  const url =
    shareContext.kind === "album"
      ? `/api/albums/${shareContext.id}/share`
      : `/api/media/${shareContext.id}/share`;

  await authFetch(url, { method: "DELETE" });
  shareModal.hidden = true;
  shareContext = null;
});

shareModalClose.addEventListener("click", () => (shareModal.hidden = true));
shareModal.addEventListener("click", (e) => {
  if (e.target === shareModal) shareModal.hidden = true;
});

// ---------- lightbox ----------

function openLightbox(item, context) {
  currentItem = item;
  currentItem._context = context;
  lightboxContent.innerHTML = "";

  if (item.type === "video") {
    const video = document.createElement("video");
    video.src = item.url;
    video.controls = true;
    video.autoplay = true;
    lightboxContent.appendChild(video);
  } else {
    const img = document.createElement("img");
    img.src = item.url;
    lightboxContent.appendChild(img);
  }

  const isTrash = context === "trash";
  lightboxAlbum.hidden = isTrash;
  lightboxFavorite.hidden = isTrash;
  lightboxShare.hidden = isTrash;
  lightboxRestore.hidden = !isTrash;
  lightboxDelete.textContent = isTrash ? "Delete forever" : "Delete";
  lightboxFavorite.classList.toggle("active", !!item.favorite);

  lightbox.hidden = false;
}

function closeLightbox() {
  lightbox.hidden = true;
  lightboxContent.innerHTML = "";
  currentItem = null;
}

lightboxClose.addEventListener("click", closeLightbox);
lightbox.addEventListener("click", (e) => {
  if (e.target === lightbox) closeLightbox();
});

lightboxDownload.addEventListener("click", async () => {
  if (!currentItem) return;
  const originalText = lightboxDownload.textContent;
  lightboxDownload.textContent = "…";
  try {
    await downloadFile(currentItem);
  } catch (err) {
    alert("Download nahi ho paya, dobara try karein.");
  } finally {
    lightboxDownload.textContent = originalText;
  }
});

lightboxFavorite.addEventListener("click", async () => {
  if (!currentItem) return;
  const newValue = !currentItem.favorite;

  await authJson(`/api/media/${currentItem._id}/favorite`, {
    method: "PATCH",
    body: JSON.stringify({ favorite: newValue }),
  });

  currentItem.favorite = newValue;
  lightboxFavorite.classList.toggle("active", newValue);
});

lightboxShare.addEventListener("click", async () => {
  if (!currentItem) return;
  const res = await authJson(`/api/media/${currentItem._id}/share`, { method: "POST" });
  const data = await res.json();
  shareContext = { kind: "media", id: currentItem._id };
  openShareModal(`${window.location.origin}/share.html?type=media&token=${data.shareToken}`);
});

lightboxAlbum.addEventListener("click", () => {
  if (!currentItem) return;
  openAlbumModal([currentItem._id]);
});

lightboxRestore.addEventListener("click", async () => {
  if (!currentItem) return;
  await authFetch(`/api/media/${currentItem._id}/restore`, { method: "POST" });
  closeLightbox();
  loadTrash();
});

lightboxDelete.addEventListener("click", async () => {
  if (!currentItem) return;

  const isTrash = currentItem._context === "trash";
  const message = isTrash
    ? "Ye HAMESHA ke liye delete ho jayega. Pakka?"
    : "Ye trash mein chala jayega, 30 din tak wahan rahega.";

  if (!confirm(message)) return;

  const url = isTrash ? `/api/media/${currentItem._id}/permanent` : `/api/media/${currentItem._id}`;

  const res = await authFetch(url, { method: "DELETE" });

  if (res.ok) {
    closeLightbox();
    if (isTrash) loadTrash();
    else if (currentTab === "favorites") loadFavorites();
    else loadGallery();
  } else {
    alert("Delete nahi ho paya, dobara try karein.");
  }
});

// ---------- upload ----------

const retryFailedBtn = document.getElementById("retryFailedBtn");
let lastFailedFiles = [];

uploadFab.addEventListener("click", () => fileInput.click());

fileInput.addEventListener("change", async () => {
  const files = Array.from(fileInput.files);
  if (files.length === 0) return;
  await uploadFiles(files);
  fileInput.value = "";
});

retryFailedBtn.addEventListener("click", async () => {
  const filesToRetry = lastFailedFiles;
  lastFailedFiles = [];
  retryFailedBtn.hidden = true;
  await uploadFiles(filesToRetry);
});

async function uploadFiles(files) {
  if (!files || files.length === 0) return;

  uploadProgress.hidden = false;
  uploadProgressFill.style.width = "0%";
  retryFailedBtn.hidden = true;

  const totalFiles = files.length;
  let completedFiles = 0;
  const fileProgress = new Array(totalFiles).fill(0);
  const fileSizes = files.map((f) => f.size || 1);
  const totalSize = fileSizes.reduce((a, b) => a + b, 0);

  function updateOverallProgress() {
    let loadedTotal = 0;
    for (let i = 0; i < totalFiles; i++) {
      loadedTotal += fileProgress[i] * fileSizes[i];
    }
    const pct = totalSize > 0 ? Math.round((loadedTotal / totalSize) * 100) : 0;
    uploadProgressFill.style.width = pct + "%";
  }

  uploadProgressText.textContent = `Uploading 0 of ${totalFiles}…`;

  function uploadSingleAttempt(file, index) {
    return new Promise((resolve) => {
      const formData = new FormData();
      formData.append("files", file);
      if (currentAlbumId) formData.append("albumId", currentAlbumId);

      const xhr = new XMLHttpRequest();
      xhr.open("POST", "/api/media/upload");
      xhr.setRequestHeader("Authorization", `Bearer ${token}`);

      xhr.upload.addEventListener("progress", (e) => {
        if (e.lengthComputable) {
          fileProgress[index] = e.loaded / e.total;
          updateOverallProgress();
        }
      });

      xhr.onload = () => resolve(xhr.status >= 200 && xhr.status < 300);
      xhr.onerror = () => resolve(false);
      xhr.ontimeout = () => resolve(false);
      xhr.timeout = 300000; // 5 minutes — gives large videos on slow connections real room to finish
      xhr.send(formData);
    });
  }

  // Retries a file a couple of times (with a short pause in between) before
  // giving up on it — a lot of "failures" on shared free hosting are just a
  // slow or momentarily busy server, and a second try quietly succeeds.
  async function uploadWithRetry(file, index) {
    const maxAttempts = 3;
    for (let attempt = 1; attempt <= maxAttempts; attempt++) {
      const ok = await uploadSingleAttempt(file, index);
      if (ok) {
        fileProgress[index] = 1;
        completedFiles++;
        uploadProgressText.textContent = `Uploading ${completedFiles} of ${totalFiles}…`;
        updateOverallProgress();
        return true;
      }
      if (attempt < maxAttempts) {
        await new Promise((r) => setTimeout(r, 1500 * attempt));
      }
    }
    completedFiles++;
    uploadProgressText.textContent = `Uploading ${completedFiles} of ${totalFiles}…`;
    return false;
  }

  // Only 2 files upload at a time — free hosting has limited memory/CPU,
  // and going easier on it makes each individual upload more likely to
  // succeed, especially for videos.
  const CONCURRENCY = 2;
  const results = new Array(totalFiles);
  let nextIndex = 0;

  async function worker() {
    while (nextIndex < files.length) {
      const i = nextIndex++;
      results[i] = await uploadWithRetry(files[i], i);
    }
  }

  const workerCount = Math.min(CONCURRENCY, files.length);
  await Promise.all(Array.from({ length: workerCount }, () => worker()));

  const failed = files.filter((_, i) => results[i] === false);

  if (failed.length === 0) {
    uploadProgressText.textContent = "Done!";
  } else {
    uploadProgressText.textContent = `${totalFiles - failed.length} of ${totalFiles} uploaded, ${failed.length} fail ho gayi.`;
    lastFailedFiles = failed;
    retryFailedBtn.hidden = false;
  }

  await loadGallery();
  loadStorageMeter();

  if (failed.length === 0) {
    setTimeout(() => {
      uploadProgress.hidden = true;
    }, 1200);
  }
}

// ---------- logout ----------

document.getElementById("logoutBtn").addEventListener("click", () => {
  localStorage.removeItem("gallery_token");
  localStorage.removeItem("gallery_user");
  window.location.href = "index.html";
});

// ---------- infinite scroll ----------

window.addEventListener("scroll", () => {
  const nearBottom = window.innerHeight + window.scrollY >= document.body.offsetHeight - 600;
  if (!nearBottom) return;

  if ((currentTab === "gallery" || currentTab === "favorites") && hasMoreMedia && !isLoadingMore) {
    loadMoreGalleryItems();
  } else if (currentTab === "trash" && hasMoreTrash && !isLoadingMoreTrash) {
    loadMoreTrashItems();
  }
});

// ---------- backup / export ----------

const exportBtn = document.getElementById("exportBtn");
const exportAlbumBtn = document.getElementById("exportAlbumBtn");

async function exportGallery(albumId) {
  const btn = albumId ? exportAlbumBtn : exportBtn;
  const originalText = btn.textContent;
  btn.textContent = "Zip taiyar ho raha hai…";
  btn.disabled = true;

  try {
    const url = albumId ? `/api/media/export?albumId=${albumId}` : "/api/media/export";
    const res = await authFetch(url);

    if (!res.ok) {
      const data = await res.json().catch(() => ({}));
      alert(data.error || "Backup nahi ban paya, dobara try karein.");
      return;
    }

    const blob = await res.blob();
    const blobUrl = URL.createObjectURL(blob);
    const a = document.createElement("a");
    a.href = blobUrl;
    a.download = "my-gallery-backup.zip";
    document.body.appendChild(a);
    a.click();
    a.remove();
    URL.revokeObjectURL(blobUrl);
  } catch (err) {
    alert("Backup nahi ban paya, dobara try karein.");
  } finally {
    btn.textContent = originalText;
    btn.disabled = false;
  }
}

if (exportBtn) {
  exportBtn.addEventListener("click", () => exportGallery(null));
}
if (exportAlbumBtn) {
  exportAlbumBtn.addEventListener("click", () => exportGallery(currentAlbumId));
}

// ---------- init ----------

loadGallery();
loadStorageMeter();

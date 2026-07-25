const params = new URLSearchParams(window.location.search);
const type = params.get("type"); // "media" or "album"
const token = params.get("token");

const shareMain = document.getElementById("shareMain");
const lightbox = document.getElementById("lightbox");
const lightboxContent = document.getElementById("lightboxContent");
const lightboxClose = document.getElementById("lightboxClose");
const lightboxDownload = document.getElementById("lightboxDownload");

let currentDownloadItem = null;

function downloadFile(item) {
  // Same fix as the main app: let Cloudinary serve the file as a native
  // browser download instead of loading it into JS memory first, which was
  // corrupting large videos.
  const a = document.createElement("a");
  a.href = item.url.replace("/upload/", "/upload/fl_attachment/");
  if (item.originalName) a.download = item.originalName;
  document.body.appendChild(a);
  a.click();
  a.remove();
}

function openLightbox(item) {
  currentDownloadItem = item;
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

  lightbox.hidden = false;
}

lightboxClose.addEventListener("click", () => {
  lightbox.hidden = true;
  lightboxContent.innerHTML = "";
});
lightbox.addEventListener("click", (e) => {
  if (e.target === lightbox) {
    lightbox.hidden = true;
    lightboxContent.innerHTML = "";
  }
});
lightboxDownload.addEventListener("click", async () => {
  if (currentDownloadItem) await downloadFile(currentDownloadItem);
});

function renderSingleMedia(item) {
  shareMain.innerHTML = "";
  const wrap = document.createElement("div");
  wrap.className = "share-single";

  let el;
  if (item.type === "video") {
    el = document.createElement("video");
    el.src = item.url;
    el.controls = true;
  } else {
    el = document.createElement("img");
    el.src = item.url;
  }
  wrap.appendChild(el);

  const downloadBtn = document.createElement("button");
  downloadBtn.className = "btn-primary btn-inline share-download-btn";
  downloadBtn.textContent = "Download";
  downloadBtn.addEventListener("click", () => downloadFile(item));
  wrap.appendChild(downloadBtn);

  shareMain.appendChild(wrap);
}

function renderAlbum(albumName, mediaList) {
  shareMain.innerHTML = "";

  const heading = document.createElement("h2");
  heading.className = "share-album-title";
  heading.textContent = albumName;
  shareMain.appendChild(heading);

  if (mediaList.length === 0) {
    const empty = document.createElement("p");
    empty.className = "share-loading";
    empty.textContent = "Is album mein abhi kuch nahi hai.";
    shareMain.appendChild(empty);
    return;
  }

  const grid = document.createElement("div");
  grid.className = "gallery-grid";

  mediaList.forEach((item) => {
    const cell = document.createElement("div");
    cell.className = "grid-item";

    if (item.type === "video") {
      const video = document.createElement("video");
      video.src = item.url;
      video.muted = true;
      video.playsInline = true;
      cell.appendChild(video);

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

    cell.addEventListener("click", () => openLightbox(item));
    grid.appendChild(cell);
  });

  shareMain.appendChild(grid);
}

async function load() {
  if (!type || !token) {
    shareMain.innerHTML = `<p class="share-loading">Ye link valid nahi hai.</p>`;
    return;
  }

  try {
    const res = await fetch(`/api/public/${type}/${token}`);
    const data = await res.json();

    if (!res.ok) {
      shareMain.innerHTML = `<p class="share-loading">${data.error || "Ye link valid nahi hai ya expire ho chuka hai."}</p>`;
      return;
    }

    if (type === "media") {
      renderSingleMedia(data.media);
    } else {
      renderAlbum(data.album.name, data.media);
    }
  } catch (err) {
    shareMain.innerHTML = `<p class="share-loading">Kuch gadbad ho gayi, dobara try karein.</p>`;
  }
}

load();

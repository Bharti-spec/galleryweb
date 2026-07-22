const form = document.getElementById("loginForm");
const errorMsg = document.getElementById("errorMsg");
const loginBtn = document.getElementById("loginBtn");
const loginBtnText = document.getElementById("loginBtnText");

// If already logged in, skip straight to gallery
if (localStorage.getItem("gallery_token")) {
  window.location.href = "gallery.html";
}

form.addEventListener("submit", async (e) => {
  e.preventDefault();
  errorMsg.hidden = true;

  const name = document.getElementById("name").value.trim();
  const phone = document.getElementById("phone").value.trim();

  loginBtn.disabled = true;
  loginBtnText.textContent = "Kholi jaa rahi hai…";

  try {
    const res = await fetch("/api/auth/login", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ name, phone }),
    });

    const data = await res.json();

    if (!res.ok) {
      throw new Error(data.error || "Login nahi ho paaya");
    }

    localStorage.setItem("gallery_token", data.token);
    localStorage.setItem("gallery_user", JSON.stringify(data.user));
    window.location.href = "gallery.html";
  } catch (err) {
    errorMsg.textContent = err.message;
    errorMsg.hidden = false;
    loginBtn.disabled = false;
    loginBtnText.textContent = "Gallery kholein";
  }
});

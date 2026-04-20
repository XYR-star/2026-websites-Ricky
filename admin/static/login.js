const form = document.getElementById("login-form");
const messageEl = document.getElementById("login-message");

function showMessage(text, type = "error") {
  messageEl.textContent = text;
  messageEl.className = `admin-message ${type}`;
}

form.addEventListener("submit", async (event) => {
  event.preventDefault();

  const formData = new FormData(form);
  const payload = Object.fromEntries(formData.entries());

  const response = await fetch("/api/admin/login", {
    method: "POST",
    headers: {
      "Content-Type": "application/json",
    },
    body: JSON.stringify(payload),
  });

  const result = await response.json().catch(() => ({}));

  if (!response.ok) {
    showMessage(result.error ?? "登录失败。");
    return;
  }

  window.location.href = "/admin";
});

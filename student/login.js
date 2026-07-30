const form = document.getElementById("studentLoginForm");
const errorBox = document.getElementById("studentLoginError");

fetch("/api/student/me")
  .then((response) => response.ok && (window.location.href = "/student/"))
  .catch(() => {});

form.addEventListener("submit", async (event) => {
  event.preventDefault();
  errorBox.hidden = true;
  const button = form.querySelector("button");
  button.disabled = true;
  button.textContent = "جارٍ الدخول...";
  try {
    const response = await fetch("/api/student/login", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        email: document.getElementById("studentEmail").value.trim(),
        password: document.getElementById("studentPassword").value,
      }),
    });
    const data = await response.json();
    if (!response.ok) throw new Error(data.error || "تعذّر تسجيل الدخول.");
    sessionStorage.setItem("madar-csrf", data.csrfToken || "");
    window.location.href = "/student/";
  } catch (error) {
    errorBox.textContent = error.message;
    errorBox.hidden = false;
  } finally {
    button.disabled = false;
    button.textContent = "تسجيل الدخول";
  }
});


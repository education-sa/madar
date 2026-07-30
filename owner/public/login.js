const loginForm = document.getElementById("loginForm");
const loginError = document.getElementById("loginError");

// If already logged in as owner, go straight to the protected dashboard.
fetch("/api/owner/me")
  .then((r) => (r.ok ? (window.location.href = "/owner/dashboard") : null))
  .catch(() => {});

loginForm.addEventListener("submit", async (event) => {
  event.preventDefault();
  loginError.hidden = true;
  const email = document.getElementById("email").value.trim();
  const password = document.getElementById("password").value;
  const otp = document.getElementById("otp").value.trim();

  const submitBtn = loginForm.querySelector("button[type=submit]");
  submitBtn.disabled = true;
  submitBtn.textContent = "جارٍ تسجيل الدخول...";

  try {
    const res = await fetch("/api/owner/login", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ email, password, otp }),
    });
    const data = await res.json();
    if (!res.ok) {
      loginError.textContent = data.error || "تعذّر تسجيل الدخول.";
      loginError.hidden = false;
      if (data.twoFactorRequired) document.getElementById("otp").focus();
      return;
    }
    if (data.csrfToken) sessionStorage.setItem("madar-owner-csrf", data.csrfToken);
    window.location.href = "/owner/dashboard";
  } catch (err) {
    loginError.textContent = "تعذّر الاتصال بالخادم، حاولي مرة أخرى.";
    loginError.hidden = false;
  } finally {
    submitBtn.disabled = false;
    submitBtn.textContent = "تسجيل الدخول";
  }
});

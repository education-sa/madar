const SCHOOL_EMAIL_DOMAIN = "@mkhg.moe.gov.sa";
function composeSchoolEmail(value) {
  const input = String(value || "").trim().toLowerCase();
  return input.includes("@") ? input : `${input}${SCHOOL_EMAIL_DOMAIN}`;
}

const loginView = document.getElementById("loginView");
const registerView = document.getElementById("registerView");
const loginForm = document.getElementById("loginForm");
const registerForm = document.getElementById("registerForm");
const loginError = document.getElementById("loginError");
const registerError = document.getElementById("registerError");
const authCard = document.getElementById("authCard");
const loginHomeLink = document.getElementById("loginHomeLink");
const showLoginBtn = document.getElementById("showLoginBtn");

// If already logged in, go straight to the dashboard.
fetch("/api/teacher/me")
  .then((r) => (r.ok ? (window.location.href = "index.html") : null))
  .catch(() => {});

function showAuthView(view) {
  const isLogin = view === "login";
  loginView.hidden = !isLogin;
  registerView.hidden = isLogin;
  authCard.classList.toggle("register-mode", !isLogin);
  authCard.setAttribute("aria-label", isLogin ? "دخول المعلم" : "إنشاء حساب المعلم");
  loginHomeLink.hidden = !isLogin;
  showLoginBtn.hidden = isLogin;
  loginError.hidden = true;
  registerError.hidden = true;
}

document.getElementById("showRegisterBtn").onclick = () => showAuthView("register");
showLoginBtn.onclick = () => showAuthView("login");

function togglePasswordVisibility(inputId, event) {
  const password = document.getElementById(inputId);
  const visible = password.type === "text";
  password.type = visible ? "password" : "text";
  event.currentTarget.setAttribute("aria-label", visible ? "إظهار كلمة المرور" : "إخفاء كلمة المرور");
}

document.getElementById("togglePassword").onclick = (event) => togglePasswordVisibility("password", event);
document.getElementById("toggleRegisterPassword").onclick = (event) => togglePasswordVisibility("regPassword", event);

loginForm.addEventListener("submit", async (event) => {
  event.preventDefault();
  loginError.hidden = true;
  const email = composeSchoolEmail(document.getElementById("email").value);
  const password = document.getElementById("password").value;

  const submitBtn = loginForm.querySelector("button[type=submit]");
  submitBtn.disabled = true;
  submitBtn.textContent = "جارٍ تسجيل الدخول...";

  try {
    const res = await fetch("/api/teacher/login", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ email, password }),
    });
    const data = await res.json();
    if (!res.ok) {
      loginError.textContent = data.error || "تعذّر تسجيل الدخول.";
      loginError.hidden = false;
      return;
    }
    if (data.csrfToken) sessionStorage.setItem("madar-csrf", data.csrfToken);
    window.location.href = "index.html";
  } catch (err) {
    loginError.textContent = "تعذّر الاتصال بالخادم، حاولي مرة أخرى.";
    loginError.hidden = false;
  } finally {
    submitBtn.disabled = false;
    submitBtn.textContent = "تسجيل الدخول";
  }
});

registerForm.addEventListener("submit", async (event) => {
  event.preventDefault();
  registerError.className = "form-error";
  registerError.hidden = true;
  if (!registerForm.checkValidity()) {
    registerForm.reportValidity();
    return;
  }

  const firstName = document.getElementById("regFirstName").value.trim();
  const fatherName = document.getElementById("regFatherName").value.trim();
  const lastName = document.getElementById("regLastName").value.trim();
  const name = [firstName, fatherName, lastName].filter(Boolean).join(" ");
  const email = composeSchoolEmail(document.getElementById("regEmail").value);
  const password = document.getElementById("regPassword").value;

  const submitBtn = registerForm.querySelector("button[type=submit]");
  submitBtn.disabled = true;
  submitBtn.textContent = "جارٍ إرسال الطلب...";

  try {
    const res = await fetch("/api/teacher/register", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ name, email, password, confirmPassword: password }),
    });
    const data = await res.json();
    if (!res.ok) {
      registerError.textContent = data.error || "تعذّر إنشاء الحساب.";
      registerError.hidden = false;
      return;
    }
    registerError.textContent = data.message || "تم إرسال طلب الحساب للموافقة.";
    registerError.className = "form-success";
    registerError.hidden = false;
    registerForm.reset();
  } catch (err) {
    registerError.textContent = "تعذّر الاتصال بالخادم، حاولي مرة أخرى.";
    registerError.hidden = false;
  } finally {
    submitBtn.disabled = false;
    submitBtn.textContent = "إرسال طلب إنشاء الحساب";
  }
});

document.getElementById("teacherForgotPassword")?.addEventListener("click", async () => {
  const value = document.getElementById("email").value.trim();
  const identifier = window.prompt("اكتبي اسم المستخدم في البريد المدرسي لإرسال طلب إعادة التعيين:", value);
  if (identifier === null || !identifier.trim()) return;
  try {
    const response = await fetch("/api/teacher/password-reset-request", { method:"POST", headers:{"Content-Type":"application/json"}, body:JSON.stringify({ identifier: composeSchoolEmail(identifier), note:"طلب من صفحة دخول المعلمة" }) });
    const data = await response.json().catch(()=>({}));
    if (!response.ok) throw new Error(data.error || "تعذّر إرسال الطلب.");
    loginError.className = "form-success";
    loginError.textContent = data.message || "تم إرسال الطلب إلى مالكة الموقع.";
    loginError.hidden = false;
  } catch (error) {
    loginError.className = "form-error";
    loginError.textContent = error.message;
    loginError.hidden = false;
  }
});

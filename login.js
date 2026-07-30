const SCHOOL_EMAIL_DOMAIN = "@mkhg.moe.gov.sa";
function composeSchoolEmail(value) {
  const input = String(value || "").trim().toLowerCase();
  return input.includes("@") ? input : `${input}${SCHOOL_EMAIL_DOMAIN}`;
}

const roleData = {
  student: {
    title: "دخول الطالبة",
    question: "لا تملكين حسابًا؟",
  },
  parent: {
    title: "دخول ولي الأمر",
    question: "ليس لديك حساب؟",
    usesNameLogin: true,
  },
  teacher: {
    title: "دخول المعلم",
    question: "ليس لديك حساب؟",
  },
  staff: {
    title: "دخول الكادر الإداري",
    question: "ليس لديك حساب؟",
    usesNameLogin: true,
  },
};

const params = new URLSearchParams(window.location.search);
const requestedRole = params.get("role");
const role = roleData[requestedRole] ? requestedRole : "student";
const currentRole = roleData[role];

const roleTitle = document.getElementById("roleTitle");
const accountQuestion = document.getElementById("accountQuestion");
const loginForm = document.getElementById("loginForm");
const username = document.getElementById("username");
const schoolIdentityFields = document.getElementById("schoolIdentityFields");
const nameIdentityFields = document.getElementById("nameIdentityFields");
const firstName = document.getElementById("firstName");
const lastName = document.getElementById("lastName");
const password = document.getElementById("password");
const passwordToggle = document.getElementById("passwordToggle");
const formMessage = document.getElementById("formMessage");
const createAccount = document.getElementById("createAccount");

roleTitle.textContent = currentRole.title;
accountQuestion.textContent = currentRole.question;
document.title = `${currentRole.title} | مدار`;
document.body.dataset.role = role;
localStorage.setItem("madar-login-role", role);
createAccount.href = `register.html?role=${encodeURIComponent(role)}`;

const usesNameLogin = Boolean(currentRole.usesNameLogin);
schoolIdentityFields.hidden = usesNameLogin;
nameIdentityFields.hidden = !usesNameLogin;
username.required = !usesNameLogin;
firstName.required = usesNameLogin;
lastName.required = usesNameLogin;

passwordToggle.addEventListener("click", () => {
  const shouldShow = password.type === "password";
  password.type = shouldShow ? "text" : "password";
  passwordToggle.classList.toggle("is-visible", shouldShow);
  passwordToggle.setAttribute("aria-label", shouldShow ? "إخفاء كلمة المرور" : "إظهار كلمة المرور");
});

loginForm.addEventListener("submit", async (event) => {
  event.preventDefault();
  formMessage.textContent = "";

  if (usesNameLogin) {
    if (!firstName.value.trim() || !lastName.value.trim() || !password.value.trim()) {
      formMessage.textContent = "فضلاً أدخلي الاسم الأول والاسم الأخير وكلمة المرور.";
      (!firstName.value.trim() ? firstName : !lastName.value.trim() ? lastName : password).focus();
      return;
    }
  } else if (!username.value.trim() || !password.value.trim()) {
    formMessage.textContent = "فضلاً أدخلي اسم المستخدم وكلمة المرور.";
    (!username.value.trim() ? username : password).focus();
    return;
  }

  const apiRole = role === "staff" ? "admin" : role;
  if (!["student", "teacher", "admin", "parent"].includes(apiRole)) {
    formMessage.textContent = "هذا النوع من الحسابات غير مفعّل حاليًا. تواصلي مع إدارة منصة مدار.";
    return;
  }
  const button = loginForm.querySelector('button[type="submit"]');
  button.disabled = true;
  button.textContent = "جارٍ تسجيل الدخول...";
  try {
    const response = await fetch(`/api/${apiRole}/login`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify(usesNameLogin
        ? { firstName: firstName.value.trim(), lastName: lastName.value.trim(), password: password.value }
        : { email: composeSchoolEmail(username.value), password: password.value }),
    });
    const data = await response.json();
    if (!response.ok) throw new Error(data.error || "تعذّر تسجيل الدخول.");
    formMessage.style.color = "#198754";
    formMessage.textContent = "تم تسجيل الدخول بنجاح.";
    const destinations = { teacher: "/teacher/", student: "/student/", admin: "/admin/", parent: "/parent/" };
    window.location.href = destinations[apiRole];
  } catch (error) {
    formMessage.style.color = "#d44949";
    formMessage.textContent = error.message;
  } finally {
    button.disabled = false;
    button.textContent = "تسجيل الدخول";
  }
});

document.getElementById("helpButton").addEventListener("click", () => {
  formMessage.style.color = "#47218c";
  formMessage.textContent = "للمساعدة، تواصلي مع إدارة منصة مدار.";
  formMessage.scrollIntoView({ behavior: "smooth", block: "center" });
});

function escapeAttributeValue(value) {
  return String(value ?? "").replace(/[&<>"']/g, (char) => ({
    "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#039;"
  })[char]);
}

document.getElementById("forgotPasswordButton")?.addEventListener("click", () => {
  const nameFields = usesNameLogin
    ? `<div class="login-name-grid"><label>الاسم الأول<input id="resetFirstName" value="${escapeAttributeValue(firstName.value)}" required></label><label>الاسم الأخير<input id="resetLastName" value="${escapeAttributeValue(lastName.value)}" required></label></div>`
    : `<label>اسم المستخدم المدرسي<input id="resetIdentifier" value="${escapeAttributeValue(username.value)}" required placeholder="اسم المستخدم"></label>`;
  const modal = document.createElement("div");
  modal.className = "reset-request-modal";
  modal.innerHTML = `<form class="reset-request-card" id="resetRequestForm"><h2>طلب إعادة تعيين كلمة المرور</h2><p>سيصل الطلب إلى الجهة المسؤولة دون عرض كلمة المرور القديمة.</p>${nameFields}<label>معلومة مساعدة (اختياري)<textarea id="resetNote" placeholder="مثال: اسم الطالبة أو الفصل"></textarea></label><div id="resetMessage" class="form-message"></div><div class="reset-request-actions"><button class="cancel" type="button">إلغاء</button><button class="send" type="submit">إرسال الطلب</button></div></form>`;
  document.body.appendChild(modal);
  modal.querySelector(".cancel").onclick = () => modal.remove();
  modal.addEventListener("click", (event) => { if (event.target === modal) modal.remove(); });
  modal.querySelector("form").onsubmit = async (event) => {
    event.preventDefault();
    const send = modal.querySelector(".send");
    const message = modal.querySelector("#resetMessage");
    send.disabled = true;
    try {
      const apiRole = role === "staff" ? "admin" : role;
      const body = usesNameLogin
        ? { firstName: modal.querySelector("#resetFirstName").value.trim(), lastName: modal.querySelector("#resetLastName").value.trim(), note: modal.querySelector("#resetNote").value.trim() }
        : { identifier: composeSchoolEmail(modal.querySelector("#resetIdentifier").value), note: modal.querySelector("#resetNote").value.trim() };
      const response = await fetch(`/api/${apiRole}/password-reset-request`, { method:"POST", headers:{"Content-Type":"application/json"}, body:JSON.stringify(body) });
      const data = await response.json().catch(()=>({}));
      if (!response.ok) throw new Error(data.error || "تعذّر إرسال الطلب.");
      message.style.color = "#198754";
      message.textContent = data.message || "تم إرسال الطلب.";
      send.textContent = "تم الإرسال";
      setTimeout(() => modal.remove(), 2200);
    } catch (error) {
      message.style.color = "#d44949";
      message.textContent = error.message;
      send.disabled = false;
    }
  };
});

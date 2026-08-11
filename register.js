const registrationRoles = {
  student: {
    title: "إنشاء حساب الطالبة",
    intro: "أدخلي بياناتك واختاري معلمتك وفصلك، ثم انتظري موافقة المعلمة.",
    nameFields: [
      { id: "firstName", label: "الاسم الأول" },
      { id: "fatherName", label: "اسم الأب", optional: true },
      { id: "lastName", label: "الاسم الأخير" },
    ],
    needsEmail: true,
    needsClass: true,
  },
  teacher: {
    title: "إنشاء حساب المعلم",
    intro: "أدخل بياناتك لإرسال طلب الانضمام إلى منصة مدار.",
    nameFields: [
      { id: "firstName", label: "الاسم الأول" },
      { id: "fatherName", label: "اسم الأب", optional: true },
      { id: "lastName", label: "الاسم الأخير" },
    ],
    needsEmail: true,
  },
  staff: {
    title: "إنشاء حساب الكادر الإداري",
    intro: "أدخل الاسم الثنائي والبريد المدرسي وكلمة المرور لإرسال طلب الانضمام.",
    nameFields: [
      { id: "firstName", label: "الاسم الأول" },
      { id: "lastName", label: "الاسم الأخير" },
    ],
    needsEmail: true,
  },
  parent: {
    title: "إنشاء حساب ولي الأمر",
    intro: "أدخل الاسم الأول والاسم الأخير وكلمة المرور، ثم أضف إيميل منصة مدرستي لكل ابنة لربطها بالحساب.",
    nameFields: [
      { id: "firstName", label: "الاسم الأول" },
      { id: "lastName", label: "الاسم الأخير" },
    ],
    needsEmail: false,
    isParent: true,
  },
};

const params = new URLSearchParams(window.location.search);
const requestedRole = params.get("role");
const role = registrationRoles[requestedRole] ? requestedRole : "student";
const settings = registrationRoles[role];

const registerTitle = document.getElementById("registerTitle");
const registerIntro = document.getElementById("registerIntro");
const dynamicFields = document.getElementById("dynamicFields");
const registerForm = document.getElementById("registerForm");
const registerMessage = document.getElementById("registerMessage");
const registerPassword = document.getElementById("registerPassword");
const passwordToggle = document.getElementById("registerPasswordToggle");
const backToLogin = document.getElementById("backToLogin");
const successLoginLink = document.getElementById("successLoginLink");
const registrationContent = document.getElementById("registrationContent");
const successPanel = document.getElementById("successPanel");
const successTitle = document.getElementById("successTitle");
const successText = document.getElementById("successText");
let registrationTeachers = [];

registerTitle.textContent = settings.title;
registerIntro.textContent = settings.intro;
document.title = `${settings.title} | مدار`;
backToLogin.href = `login.html?role=${encodeURIComponent(role)}`;
successLoginLink.href = `login.html?role=${encodeURIComponent(role)}`;

function fieldTemplate({ id, label, placeholder, type = "text", direction = "rtl", required = true }) {
  return `
    <label class="field register-field">
      <span class="field-label">${label}${required ? "" : " <small>(اختياري)</small>"}</span>
      <input id="${id}" name="${id}" type="${type}" placeholder="${placeholder}" dir="${direction}" ${required ? "required" : ""} />
    </label>
  `;
}

const SCHOOL_EMAIL_DOMAIN = "@mkhg.moe.gov.sa";
function composeSchoolEmail(value) {
  const input = String(value || "").trim().toLowerCase();
  return input.includes("@") ? input : `${input}${SCHOOL_EMAIL_DOMAIN}`;
}
function schoolEmailTemplate(id, label, required = true) {
  return `
    <label class="field register-field">
      <span class="field-label">${label}${required ? "" : " <small>(اختياري)</small>"}</span>
      <span class="register-school-email" dir="ltr">
        <input id="${id}" name="${id}" type="text" inputmode="email" autocomplete="username" placeholder="اسم المستخدم" ${required ? "required" : ""} />
        <span>${SCHOOL_EMAIL_DOMAIN}</span>
      </span>
    </label>
  `;
}

const nameGridClass = settings.nameFields.length === 3 ? "name-grid-three" : "name-grid-two";
dynamicFields.insertAdjacentHTML(
  "beforeend",
  `<div class="name-grid ${nameGridClass}">
    ${settings.nameFields.map((field) => fieldTemplate({
      id: field.id,
      label: field.label,
      placeholder: field.label,
      required: !field.optional,
    })).join("")}
  </div>`
);

if (settings.needsEmail) {
  dynamicFields.insertAdjacentHTML("beforeend", schoolEmailTemplate("madrasatiEmail", "إيميل منصة مدرستي"));
}

if (settings.needsClass) {
  dynamicFields.insertAdjacentHTML("beforeend", `
    <div class="registration-school-grid">
      <label class="field register-field">
        <span class="field-label">المعلمة</span>
        <select id="registrationTeacher" required disabled><option value="">جارٍ تحميل المعلمات...</option></select>
      </label>
      <label class="field register-field">
        <span class="field-label">الفصل</span>
        <select id="registrationClass" required disabled><option value="">اختاري المعلمة أولًا</option></select>
      </label>
    </div>
  `);
}

if (settings.isParent) {
  dynamicFields.insertAdjacentHTML("beforeend", `
    <div class="daughter-emails">
      <p class="daughter-emails-title">إيميلات منصة مدرستي للطالبات</p>
      <div id="daughterEmailList"></div>
      <button class="add-daughter" id="addDaughterEmail" type="button">+ إضافة إيميل طالبة أخرى</button>
    </div>
  `);
}

function addDaughterEmail() {
  const list = document.getElementById("daughterEmailList");
  const row = document.createElement("div");
  row.className = "daughter-email-row";
  row.innerHTML = `
    <span class="daughter-school-email" dir="ltr"><input type="text" inputmode="email" name="daughterEmails" placeholder="اسم المستخدم" aria-label="اسم المستخدم في إيميل منصة مدرستي للطالبة" required /><span>${SCHOOL_EMAIL_DOMAIN}</span></span>
    <button class="remove-daughter" type="button" aria-label="حذف هذا الإيميل">×</button>
  `;
  row.querySelector(".remove-daughter").addEventListener("click", () => {
    if (list.children.length > 1) row.remove();
  });
  list.appendChild(row);
}

if (settings.isParent) {
  addDaughterEmail();
  document.getElementById("addDaughterEmail").addEventListener("click", addDaughterEmail);
}

function fillRegistrationClasses() {
  const teacherSelect = document.getElementById("registrationTeacher");
  const classSelect = document.getElementById("registrationClass");
  const teacher = registrationTeachers.find((item) => String(item.id) === teacherSelect.value);
  classSelect.replaceChildren();
  const placeholder = document.createElement("option");
  placeholder.value = "";
  placeholder.textContent = "اختاري الفصل";
  classSelect.appendChild(placeholder);
  (teacher?.classes || []).forEach((item) => {
    const option = document.createElement("option");
    option.value = String(item.id);
    option.textContent = `${item.name} · ${item.stage} · ${item.gradeLabel}`;
    classSelect.appendChild(option);
  });
  classSelect.disabled = !teacher;
  if (teacher?.classes.length === 1) classSelect.value = String(teacher.classes[0].id);
}

async function loadRegistrationOptions() {
  if (!settings.needsClass) return;
  const teacherSelect = document.getElementById("registrationTeacher");
  try {
    const response = await fetch("/api/student/registration-options");
    const data = await response.json();
    if (!response.ok) throw new Error(data.error || "تعذّر تحميل الفصول.");
    registrationTeachers = data.teachers || [];
    teacherSelect.replaceChildren();
    const placeholder = document.createElement("option");
    placeholder.value = "";
    placeholder.textContent = "اختاري المعلمة";
    teacherSelect.appendChild(placeholder);
    registrationTeachers.forEach((item) => {
      const option = document.createElement("option");
      option.value = String(item.id);
      option.textContent = item.name;
      teacherSelect.appendChild(option);
    });
    teacherSelect.disabled = registrationTeachers.length === 0;
    if (registrationTeachers.length === 1) teacherSelect.value = String(registrationTeachers[0].id);
    fillRegistrationClasses();
    if (!registrationTeachers.length) registerMessage.textContent = "لا توجد فصول متاحة للتسجيل حاليًا. تواصلي مع معلمتك.";
  } catch (error) {
    registerMessage.textContent = error.message;
    teacherSelect.innerHTML = '<option value="">تعذّر تحميل المعلمات</option>';
  }
}

if (settings.needsClass) {
  document.getElementById("registrationTeacher").addEventListener("change", fillRegistrationClasses);
  loadRegistrationOptions();
}

passwordToggle.addEventListener("click", () => {
  const shouldShow = registerPassword.type === "password";
  registerPassword.type = shouldShow ? "text" : "password";
  passwordToggle.classList.toggle("is-visible", shouldShow);
  passwordToggle.setAttribute("aria-label", shouldShow ? "إخفاء كلمة المرور" : "إظهار كلمة المرور");
});

function validSchoolEmailInput(value) {
  const input = String(value || "").trim();
  if (!input || /\s/.test(input)) return false;
  const email = composeSchoolEmail(input);
  return /^[^\s@]+@mkhg\.moe\.gov\.sa$/i.test(email);
}

function showRegistrationSuccess(message) {
  registrationContent.hidden = true;
  successPanel.hidden = false;
  successTitle.textContent = role === "student" ? "رائع! تم إنشاء الحساب" : "تم إرسال طلبك";
  successText.textContent = role === "student"
    ? "انتظري موافقة المعلمة، وبعدها يمكنكِ تسجيل الدخول بحسابك."
    : role === "parent"
      ? "تم إرسال الطلب إلى معلمة الطالبة. بعد الموافقة يمكنك تسجيل الدخول ومتابعة جميع الأبناء المرتبطين."
      : message;
}

registerForm.addEventListener("submit", async (event) => {
  event.preventDefault();
  registerMessage.style.color = "#d44949";
  registerMessage.textContent = "";

  const missingNameField = settings.nameFields.find((field) => !field.optional && !document.getElementById(field.id).value.trim());
  if (missingNameField) {
    registerMessage.textContent = `فضلاً أدخل ${missingNameField.label}.`;
    document.getElementById(missingNameField.id).focus();
    return;
  }

  if (settings.needsEmail) {
    const email = document.getElementById("madrasatiEmail").value.trim();
    if (!validSchoolEmailInput(email)) {
      registerMessage.textContent = "فضلاً أدخل إيميل منصة مدرستي بشكل صحيح.";
      document.getElementById("madrasatiEmail").focus();
      return;
    }
  }

  if (settings.needsClass && !document.getElementById("registrationClass").value) {
    registerMessage.textContent = "فضلاً اختاري المعلمة والفصل.";
    document.getElementById("registrationTeacher").focus();
    return;
  }

  if (settings.isParent) {
    const daughterEmails = [...document.querySelectorAll('[name="daughterEmails"]')];
    const invalidEmail = daughterEmails.find((input) => !validSchoolEmailInput(input.value));
    if (invalidEmail) {
      registerMessage.textContent = "فضلاً أدخل إيميلات منصة مدرستي للطالبات بشكل صحيح.";
      invalidEmail.focus();
      return;
    }
  }

  if (registerPassword.value.length < 10 || !/[A-Za-z]/.test(registerPassword.value) || !/\d/.test(registerPassword.value)) {
    registerMessage.textContent = "كلمة المرور يجب أن تكون 10 أحرف على الأقل وتحتوي حرفًا ورقمًا.";
    registerPassword.focus();
    return;
  }

  if (!["student", "teacher", "parent"].includes(role)) {
    registerMessage.textContent = "يرجى التواصل مع إدارة منصة مدار لإنشاء هذا الحساب.";
    return;
  }

  const name = settings.nameFields.map((field) => document.getElementById(field.id).value.trim()).filter(Boolean).join(" ");
  const endpoint = role === "student" ? "/api/student/register" : role === "teacher" ? "/api/teacher/register" : "/api/parent/register";
  const payload = { name, password: registerPassword.value, confirmPassword: registerPassword.value };
  if (settings.needsEmail) payload.email = composeSchoolEmail(document.getElementById("madrasatiEmail").value);
  if (role === "student") payload.classId = Number(document.getElementById("registrationClass").value);
  if (role === "parent") {
    payload.firstName = document.getElementById("firstName").value.trim();
    payload.lastName = document.getElementById("lastName").value.trim();
    payload.daughterEmails = [...document.querySelectorAll('[name="daughterEmails"]')].map((input) => composeSchoolEmail(input.value));
  }
  const submitButton = registerForm.querySelector('button[type="submit"]');
  submitButton.disabled = true;
  submitButton.textContent = "جارٍ إرسال الطلب...";

  try {
    const response = await fetch(endpoint, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify(payload),
    });
    const data = await response.json();
    if (!response.ok) throw new Error(data.error || "تعذّر إرسال الطلب.");
    registerForm.reset();
    showRegistrationSuccess(data.message || "تم إرسال طلب الحساب للموافقة.");
  } catch (error) {
    registerMessage.textContent = error.message;
  } finally {
    submitButton.disabled = false;
    submitButton.textContent = "إرسال طلب إنشاء الحساب";
  }
});

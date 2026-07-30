(() => {
  "use strict";
  const path = location.pathname;
  const role = path.startsWith("/owner/") ? "owner" : path.startsWith("/teacher/") ? "teacher" : path.startsWith("/student/") ? "student" : path.startsWith("/parent/") ? "parent" : path.startsWith("/admin/") ? "admin" : null;
  if (!role || document.querySelector("[data-disable-privacy-consent]")) return;

  async function fetchJson(url, options = {}) {
    const response = await fetch(url, options);
    const data = await response.json().catch(() => ({}));
    if (!response.ok) throw new Error(data.error || "تعذّر تحميل سياسة الخصوصية.");
    return data;
  }

  async function start() {
    try {
      const me = await fetchJson(`/api/${role}/me`);
      const status = await fetchJson(`/api/${role}/privacy`);
      if (status.accepted) return;
      const banner = document.createElement("section");
      banner.className = "madar-privacy-consent";
      banner.setAttribute("role", "dialog");
      banner.setAttribute("aria-label", "الموافقة على سياسة الخصوصية");
      banner.innerHTML = `<div><strong>حماية بياناتك مهمة في مدار</strong><p>باستمرار استخدام المنصة أنت توافق على <a href="${status.privacyUrl}" target="_blank" rel="noopener">سياسة الخصوصية</a> و<a href="${status.termsUrl}" target="_blank" rel="noopener">شروط الاستخدام</a>. لا تُعرض كلمات المرور أو الرموز السرية لأي مستخدم.</p></div><button type="button">موافق</button>`;
      document.body.appendChild(banner);
      banner.querySelector("button").onclick = async () => {
        const button = banner.querySelector("button");
        button.disabled = true;
        try {
          await fetchJson(`/api/${role}/privacy`, { method: "POST", headers: { "Content-Type": "application/json", "X-CSRF-Token": me.csrfToken || "" }, body: "{}" });
          banner.remove();
        } catch (error) {
          button.disabled = false;
          button.textContent = "تعذّر الحفظ — أعيدي المحاولة";
        }
      };
    } catch (_) {
      // لا نعطّل اللوحة إذا تعذر تحميل إشعار الخصوصية.
    }
  }
  if (document.readyState === "loading") document.addEventListener("DOMContentLoaded", start); else start();
})();

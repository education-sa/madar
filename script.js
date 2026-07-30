const menuToggle = document.getElementById("menuToggle");
const mainNav = document.getElementById("mainNav");
const modal = document.getElementById("modal");
const modalTitle = document.getElementById("modalTitle");
const modalText = document.getElementById("modalText");
const modalIcon = document.getElementById("modalIcon");

function showModal(title, text, icon = "✨") {
  modalTitle.textContent = title;
  modalText.textContent = text;
  modalIcon.textContent = icon;
  modal.classList.add("show");
  modal.setAttribute("aria-hidden", "false");
  document.body.style.overflow = "hidden";
}

function hideModal() {
  modal.classList.remove("show");
  modal.setAttribute("aria-hidden", "true");
  document.body.style.overflow = "";
}

menuToggle?.addEventListener("click", () => {
  const isOpen = mainNav.classList.toggle("open");
  menuToggle.setAttribute("aria-expanded", String(isOpen));
});

document.querySelectorAll(".main-nav a").forEach((link) => {
  link.addEventListener("click", (event) => {
    document.querySelectorAll(".main-nav a").forEach((item) => item.classList.remove("active"));
    link.classList.add("active");
    mainNav.classList.remove("open");
    menuToggle?.setAttribute("aria-expanded", "false");

    if (link.dataset.placeholder) {
      event.preventDefault();
      showModal(
        link.dataset.placeholder,
        `سننشئ قسم ${link.dataset.placeholder} في الخطوات القادمة بعد اعتماد شكل الصفحة الرئيسية.`,
        "🚧"
      );
    }
  });
});

document.getElementById("startLearningButton")?.addEventListener("click", (event) => {
  event.preventDefault();
  showModal(
    "ابدئي التعلّم",
    "سنربط هذا الزر بصفحات المراحل الدراسية بعد اعتماد الواجهة الرئيسية.",
    "🚀"
  );
});

document.getElementById("helpButton")?.addEventListener("click", () => {
  showModal(
    "كيف نساعدك؟",
    "يمكن ربط هذا الزر لاحقًا بنموذج تواصل أو واتساب أو مساعد ذكي داخل المنصة.",
    "💬"
  );
});

document.querySelectorAll("[data-close-modal]").forEach((element) => {
  element.addEventListener("click", hideModal);
});

document.addEventListener("keydown", (event) => {
  if (event.key === "Escape") hideModal();
});



document.querySelectorAll(".stage-hotspot, .mobile-stage-card").forEach((button) => {
  button.addEventListener("click", () => {
    const stageRoutes = {
      "المرحلة الابتدائية": "primary",
      "المرحلة المتوسطة": "middle",
      "المرحلة الثانوية": "secondary",
    };
    const stage = stageRoutes[button.dataset.stage] || "primary";
    window.location.href = `stage.html?stage=${encodeURIComponent(stage)}`;
  });
});

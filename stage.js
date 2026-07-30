const stageData = {
  primary: {
    label: "المرحلة الابتدائية",
    shortLabel: "الابتدائية",
  },
  middle: {
    label: "المرحلة المتوسطة",
    shortLabel: "المتوسطة",
  },
  secondary: {
    label: "المرحلة الثانوية",
    shortLabel: "الثانوية",
  },
};

const params = new URLSearchParams(window.location.search);
const requestedStage = params.get("stage");
const stage = stageData[requestedStage] ? requestedStage : "primary";
const currentStage = stageData[stage];

const savedName = (localStorage.getItem("madar-user-name") || "").trim();
const displayName = savedName || "طالبة مدار";

document.getElementById("welcomeName").textContent = `أهلًا بدخولكِ يا ${displayName}`;
document.getElementById("stageBadge").textContent = currentStage.label;
document.getElementById("stageKicker").textContent = `مساركِ في ${currentStage.label}`;
document.title = `مداري التعليمي - ${currentStage.shortLabel} | مدار`;

const toast = document.getElementById("stageToast");
const toastText = document.getElementById("toastText");

function showToast(message) {
  toastText.textContent = message;
  toast.hidden = false;
}

document.querySelectorAll("[data-section]").forEach((button) => {
  button.addEventListener("click", () => {
    if (button.dataset.section === "الألعاب التفاعلية") {
      window.location.href = "games/percentage.html";
      return;
    }
    showToast(`لا يوجد محتوى منشور في قسم ${button.dataset.section} لـ${currentStage.label} حتى الآن.`);
  });
});

const profileButton = document.getElementById("profileButton");

profileButton.addEventListener("click", () => {
  profileButton.classList.remove("is-pressed");
  void profileButton.offsetWidth;
  profileButton.classList.add("is-pressed");
  window.setTimeout(() => profileButton.classList.remove("is-pressed"), 520);
  sessionStorage.setItem("madar-student-view", "home");
  window.setTimeout(() => { window.location.href = "/student/"; }, 220);
});

document.getElementById("closeToast").addEventListener("click", () => {
  toast.hidden = true;
});

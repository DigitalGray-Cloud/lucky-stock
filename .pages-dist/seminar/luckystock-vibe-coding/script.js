const progressBar = document.getElementById("progress-bar");
const sections = Array.from(document.querySelectorAll(".panel[id]"));
const navLinks = Array.from(document.querySelectorAll(".nav-link"));
const themeToggle = document.getElementById("theme-toggle");
const rootBody = document.body;

function updateProgress() {
  const scrollTop = window.scrollY;
  const docHeight = document.documentElement.scrollHeight - window.innerHeight;
  const progress = docHeight > 0 ? (scrollTop / docHeight) * 100 : 0;
  progressBar.style.width = `${Math.min(100, Math.max(0, progress))}%`;
}

function updateActiveSection() {
  const checkpoint = window.scrollY + window.innerHeight * 0.35;
  let currentId = sections[0]?.id || "";
  for (const section of sections) {
    if (section.offsetTop <= checkpoint) currentId = section.id;
  }
  navLinks.forEach((link) => {
    const isActive = link.getAttribute("href") === `#${currentId}`;
    link.classList.toggle("active", isActive);
  });
}

const revealObserver = new IntersectionObserver((entries) => {
  entries.forEach((entry) => {
    if (entry.isIntersecting) entry.target.classList.add("in-view");
  });
}, { threshold: 0.18 });

document.querySelectorAll(".reveal").forEach((el) => revealObserver.observe(el));

const savedTheme = localStorage.getItem("luckystock-vibe-theme");
if (savedTheme === "dark") {
  rootBody.setAttribute("data-theme", "dark");
  themeToggle.textContent = "Light";
}

themeToggle.addEventListener("click", () => {
  const isDark = rootBody.getAttribute("data-theme") === "dark";
  if (isDark) {
    rootBody.removeAttribute("data-theme");
    localStorage.setItem("luckystock-vibe-theme", "light");
    themeToggle.textContent = "Dark";
  } else {
    rootBody.setAttribute("data-theme", "dark");
    localStorage.setItem("luckystock-vibe-theme", "dark");
    themeToggle.textContent = "Light";
  }
});

window.addEventListener("scroll", () => {
  updateProgress();
  updateActiveSection();
}, { passive: true });

window.addEventListener("load", () => {
  updateProgress();
  updateActiveSection();
});

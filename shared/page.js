/* Общий рендер: ссылки, цифры, эпизоды и появление секций.
 * Механики вариантов сюда не лезут — у каждого свой файл.
 */
(() => {
  "use strict";

  // Появление секций ставим первым делом и безусловно. base.css прячет
  // .reveal, пока наблюдатель не пометит element data-revealed — если бы
  // это осталось внизу за проверкой `if (!D) return`, отказ shared/content.js
  // оставлял бы всю страницу невидимой. Данные ниже могут не прийти,
  // наблюдатель — обязан быть всегда.
  const io = new IntersectionObserver((entries, obs) => {
    entries.forEach(e => {
      if (!e.isIntersecting) return;
      e.target.dataset.revealed = "";
      obs.unobserve(e.target);
    });
  }, { rootMargin: "0px 0px -12% 0px" });
  document.querySelectorAll(".reveal").forEach(el => io.observe(el));

  const D = window.SOULS;
  if (!D) return;

  // Ссылки и цифры проставляются из данных, чтобы в трёх вариантах
  // не разъезжались адреса.
  document.querySelectorAll("[data-link]").forEach(a => {
    const href = D.links[a.dataset.link];
    if (href) a.href = href;
  });
  document.querySelectorAll("[data-stat]").forEach(el => {
    const v = D.audience[el.dataset.stat];
    if (v) el.textContent = v;
  });

  const box = document.querySelector("[data-episodes]");
  if (box && Array.isArray(D.episodes) && D.episodes.length) {
    const fmt = new Intl.DateTimeFormat("en", { month: "short", day: "numeric" });
    box.textContent = "";
    D.episodes.forEach((ep, i) => {
      const row = document.createElement("article");
      row.className = "episode reveal";
      const n = String(D.episodes.length - i).padStart(2, "0");
      row.innerHTML =
        '<p class="meta"><span class="ep-no"></span><span class="ep-date"></span></p>' +
        '<p class="line ep-line"></p>' +
        '<a class="btn-ghost ep-link" target="_blank" rel="noopener">watch</a>';
      row.querySelector(".ep-no").textContent = "EP " + n;
      row.querySelector(".ep-date").textContent = fmt.format(new Date(ep.date + "T12:00:00"));
      row.querySelector(".ep-line").textContent = ep.line;
      row.querySelector(".ep-link").href = ep.url;
      box.append(row);
      // Строка родилась после того, как наблюдатель уже прошёлся по .reveal
      // выше — сама она под слежение не попала, добираем вручную.
      io.observe(row);
    });
  }
})();

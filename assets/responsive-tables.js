(() => {
  "use strict";
  const WRAPPER_CLASS = "responsive-table";

  function wrapTable(table) {
    if (!(table instanceof HTMLTableElement)) return;
    if (table.closest(`.${WRAPPER_CLASS},.table-wrap,.table-scroll,.owner-table-scroll,.data-table-wrap`)) return;
    if (table.dataset.noResponsiveWrap === "true") return;
    const wrapper = document.createElement("div");
    wrapper.className = WRAPPER_CLASS;
    wrapper.setAttribute("tabindex", "0");
    wrapper.setAttribute("role", "region");
    wrapper.setAttribute("aria-label", table.getAttribute("aria-label") || "جدول قابل للتمرير أفقيًا وعموديًا");
    table.parentNode?.insertBefore(wrapper, table);
    wrapper.appendChild(table);
  }

  function scan(root = document) {
    root.querySelectorAll?.("table").forEach(wrapTable);
  }

  function addHints(root = document) {
    root.querySelectorAll?.(`.${WRAPPER_CLASS},.table-wrap,.table-scroll,.owner-table-scroll,.data-table-wrap`).forEach((wrapper) => {
      if (wrapper.dataset.scrollHintReady === "1") return;
      wrapper.dataset.scrollHintReady = "1";
      const table = wrapper.querySelector("table");
      if (!table) return;
      requestAnimationFrame(() => {
        if (table.scrollWidth <= wrapper.clientWidth + 8) return;
        const hint = document.createElement("div");
        hint.className = "table-scroll-hint";
        hint.textContent = "اسحبي داخل الجدول يمينًا ويسارًا، ولأعلى وأسفل عند كثرة البيانات";
        wrapper.parentNode?.insertBefore(hint, wrapper);
      });
    });
  }

  const refresh = (root = document) => {
    scan(root);
    addHints(root);
  };

  if (document.readyState === "loading") {
    document.addEventListener("DOMContentLoaded", () => refresh());
  } else {
    refresh();
  }

  const observer = new MutationObserver((records) => {
    for (const record of records) {
      for (const node of record.addedNodes) {
        if (!(node instanceof Element)) continue;
        if (node.matches?.("table")) wrapTable(node);
        refresh(node);
      }
    }
  });
  observer.observe(document.documentElement, { childList: true, subtree: true });
  window.MadarResponsiveTables = { refresh };
})();

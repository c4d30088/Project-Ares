// Search box and explanations for the debug panel. Adds a line of explanation under every
// control that has one, and a search box that hides everything that does not match what
// was typed (it reads names, property names, explanations and folder names) and opens the
// folders that still have matches.

import type GUI from "lil-gui";
import type { Controller } from "lil-gui";
import { noteFor } from "./panelNotes";

interface Row {
  controller: Controller;
  desc: HTMLElement;
  note: string | undefined;
  /** Lower-case text the search looks through. */
  haystack: string;
}

export function decoratePanel(gui: GUI): void {
  if (typeof document === "undefined") return;

  const rows: Row[] = [];
  for (const c of gui.controllersRecursive()) {
    const note = noteFor(c.object, c.property);
    const desc = document.createElement("div");
    desc.className = "ares-desc";
    desc.textContent = note ?? "";
    c.domElement.insertAdjacentElement("afterend", desc);
    if (note) c.domElement.title = note;
    else desc.style.display = "none";
    const folders: string[] = [];
    for (let p: GUI | undefined = c.parent; p && p !== gui; p = p.parent) folders.push(p._title);
    const label = c.domElement.querySelector(".lil-name")?.textContent ?? "";
    rows.push({ controller: c, desc, note, haystack: [label, c.property, note ?? "", ...folders].join(" ").toLowerCase() });
  }

  const folders = gui.foldersRecursive();
  const startedClosed = new Map(folders.map((f) => [f, f._closed]));

  const input = document.createElement("input");
  input.type = "search";
  input.placeholder = "search tunables...";
  input.className = "ares-search";
  input.setAttribute("aria-label", "Search the debug panel");
  gui.$children.prepend(input);

  const apply = () => {
    const words = input.value.toLowerCase().split(/\s+/).filter(Boolean);
    const searching = words.length > 0;
    const visible = new Set<Controller>();
    for (const r of rows) {
      const show = !searching || words.every((w) => r.haystack.includes(w));
      r.controller.show(show);
      r.desc.style.display = show && r.note ? "" : "none";
      if (show) visible.add(r.controller);
    }
    // Deepest folders first, so a parent sees whether any child folder survived.
    for (const f of [...folders].reverse()) {
      const any = f.controllersRecursive().some((c) => visible.has(c));
      f.show(!searching || any);
      f.open(searching ? any : !startedClosed.get(f));
    }
  };
  input.addEventListener("input", apply);
}

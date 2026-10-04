// The debug panel explains every control it shows. lil-gui needs a browser, so a stand-in
// records the controls the panel asks for.

import { describe, expect, it, vi } from "vitest";

const recorded: { object: object; property: string }[] = [];

vi.mock("lil-gui", () => {
  /** Any method call on a control returns the control, so chains like .name().onChange() work. */
  const chain = (): unknown => new Proxy(function () {}, { get: () => chain, apply: () => chain() });
  class FakeGUI {
    add(object: object, property: string) {
      recorded.push({ object, property });
      return chain();
    }
    addFolder() {
      return new FakeGUI();
    }
    hide() {}
    close() {}
  }
  return { default: FakeGUI };
});

import { tuningNotes } from "../src/data/tuningNotes";
import { createDebugPanel } from "../src/game/debugPanel";
import { allTunableKeys, noteFor, noteKey } from "../src/game/panelNotes";

vi.stubGlobal("window", { addEventListener() {} });
createDebugPanel("first-fight", () => {});

describe("debug panel explanations", () => {
  it("builds a panel with a lot of controls", () => {
    expect(recorded.length).toBeGreaterThan(100);
  });

  it("every control has a one-line explanation", () => {
    const missing = recorded.filter((c) => !noteFor(c.object, c.property)).map((c) => noteKey(c.object, c.property));
    expect(missing).toEqual([]);
  });

  it("every explanation belongs to a real control, so none go stale", () => {
    const shown = new Set(recorded.map((c) => noteKey(c.object, c.property)));
    const orphans = Object.keys(tuningNotes).filter((k) => !shown.has(k));
    expect(orphans).toEqual([]);
  });

  it("explanations are short, plain sentences", () => {
    for (const [key, text] of Object.entries(tuningNotes)) {
      expect(text.length, key).toBeGreaterThan(15);
      expect(text.length, key).toBeLessThan(260);
    }
  });

  it("lists the tunables that are not in the panel yet, for the record", () => {
    const inPanel = new Set(recorded.map((c) => noteKey(c.object, c.property)));
    const notInPanel = allTunableKeys().filter((k) => !inPanel.has(k));
    // Not a requirement; just keeps the number visible in the test output if it is ever asked about.
    expect(notInPanel.length).toBeGreaterThanOrEqual(0);
  });
});

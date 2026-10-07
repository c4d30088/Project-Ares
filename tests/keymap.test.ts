// The key map: every action has exactly one key, rebinding swaps instead of leaving an action
// without a key, fixed keys stay fixed, and browser shortcuts are left alone.

import { describe, expect, it } from "vitest";
import { ACTIONS, actionFor, bindable, defaultKeys, keyLabel, parseKeyMap, rebind } from "../src/game/keymap";

describe("key map", () => {
  it("defaults: every action has a key and no key is used twice", () => {
    const keys = ACTIONS.map((a) => defaultKeys[a.id]);
    expect(new Set(keys).size).toBe(keys.length);
    expect(defaultKeys.burnTo).toBe("b");
    expect(defaultKeys.pause).toBe(" ");
  });

  it("finds the action for a key press, either case; Cmd or Ctrl stays with the browser", () => {
    expect(actionFor(defaultKeys, { key: "B" })).toBe("burnTo");
    expect(actionFor(defaultKeys, { key: "b" })).toBe("burnTo");
    expect(actionFor(defaultKeys, { key: " " })).toBe("pause");
    expect(actionFor(defaultKeys, { key: "]" })).toBe("faster");
    expect(actionFor(defaultKeys, { key: "b", metaKey: true })).toBeNull();
    expect(actionFor(defaultKeys, { key: "=", ctrlKey: true })).toBeNull();
    expect(actionFor(defaultKeys, { key: "x" })).toBeNull();
  });

  it("rebinding to a free key just moves it", () => {
    const { map, swappedWith } = rebind(defaultKeys, "burnTo", "X");
    expect(map.burnTo).toBe("x");
    expect(swappedWith).toBeNull();
    expect(actionFor(map, { key: "b" })).toBeNull();
  });

  it("rebinding to a key in use swaps the two", () => {
    const { map, swappedWith } = rebind(defaultKeys, "burnTo", "i");
    expect(map.burnTo).toBe("i");
    expect(map.rendezvous).toBe("b");
    expect(swappedWith).toBe("rendezvous");
    const keys = Object.values(map);
    expect(new Set(keys).size).toBe(keys.length);
  });

  it("Esc, the debug key, Enter, Tab, modifiers and function keys cannot be bound", () => {
    for (const k of ["Escape", "`", "Enter", "Tab", "Shift", "Meta", "F5", "F12"]) expect(bindable(k), k).toBe(false);
    for (const k of ["q", "Q", "5", " ", "ArrowUp", ";"]) expect(bindable(k), k).toBe(true);
  });

  it("reading saved keys: junk and clashes fall back to the defaults", () => {
    expect(parseKeyMap(undefined)).toEqual(defaultKeys);
    expect(parseKeyMap({ burnTo: "x", nonsense: "y", coast: "Escape" })).toEqual({ ...defaultKeys, burnTo: "x" });
    // Two actions on one key: both go back to their own defaults.
    const clash = parseKeyMap({ burnTo: "z", coast: "z" });
    expect(clash.burnTo).toBe("b");
    expect(clash.coast).toBe("c");
  });

  it("labels keys for the buttons", () => {
    expect(keyLabel("b")).toBe("B");
    expect(keyLabel(" ")).toBe("SPACE");
    expect(keyLabel("arrowup")).toBe("↑");
    expect(keyLabel("[")).toBe("[");
  });
});

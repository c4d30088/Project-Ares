// Finds the explanation for a debug panel control from the object and property it edits.

import { tuningNotes } from "../data/tuningNotes";
import { tuningRoots } from "../data/tuningRoots";

/** Each tuning object (and each object nested inside one) mapped to its name: navTuning,
 *  railgunTuning.light, ... */
const names = new Map<object, string>();
function register(obj: object, path: string): void {
  names.set(obj, path);
  for (const [k, v] of Object.entries(obj)) {
    if (v && typeof v === "object" && !Array.isArray(v)) register(v, `${path}.${k}`);
  }
}
for (const [name, obj] of Object.entries(tuningRoots)) register(obj, name);

/** The notes key for a control: "navTuning.arriveDistance". Controls on objects that are not
 *  tuning (the scenario picker, restart, copy values) are filed under "panel". */
export function noteKey(object: object, property: string): string {
  return `${names.get(object) ?? "panel"}.${property}`;
}

export function noteFor(object: object, property: string): string | undefined {
  return tuningNotes[noteKey(object, property)];
}

/** Every key a real tunable can have, for checking the notes against the code. */
export function allTunableKeys(): string[] {
  const keys: string[] = [];
  for (const [path, obj] of names) {
    for (const [k, v] of Object.entries(obj)) if (!(v && typeof v === "object" && !Array.isArray(v))) keys.push(`${path}.${k}`);
  }
  return keys;
}

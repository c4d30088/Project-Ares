// Display names for ship systems, shared by hit text and the alert log.

const LABELS: Record<string, string> = {
  hull: "HULL",
  drive: "DRIVE",
  reactor: "REACTOR",
  sensors: "SENSORS",
  radiators: "RADIATORS",
  crew: "CREW",
  tubes: "TUBES",
  railgun: "RAILGUN",
};

/** "sensors" to "SENSORS", "pdc3" to "PDC 3". */
export function subsystemLabel(id: string): string {
  if (id.startsWith("pdc")) return `PDC ${id.slice(3)}`;
  return LABELS[id] ?? id.toUpperCase();
}

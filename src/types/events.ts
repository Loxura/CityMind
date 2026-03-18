// Policy event — recorded each time the user changes a policy lever.
// Stored in App.tsx state and passed to every time-series chart for
// vertical marker lines.

export interface PolicyEvent {
  tick:  number;
  label: string;  // e.g. "Tax 0%→35%", "UBI on", "Min wage 5"
  color: string;  // fixed per policy field — see PolicyConsole.tsx
}

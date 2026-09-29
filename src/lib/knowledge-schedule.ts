export type DueKnowledgeSlot = { localDate: string; slot: string };

export function localKnowledgeClock(now: Date, timeZone: string) {
  const parts = new Intl.DateTimeFormat("en-CA", {
    timeZone,
    year: "numeric",
    month: "2-digit",
    day: "2-digit",
    hour: "2-digit",
    minute: "2-digit",
    hourCycle: "h23",
  }).formatToParts(now);
  const values = Object.fromEntries(parts.filter((part) => part.type !== "literal").map((part) => [part.type, part.value]));
  return {
    localDate: `${values.year}-${values.month}-${values.day}`,
    minutes: Number(values.hour) * 60 + Number(values.minute),
  };
}

export function dueKnowledgeSlots(now: Date, timeZone: string, scheduleSlots: readonly string[]): DueKnowledgeSlot[] {
  const local = localKnowledgeClock(now, timeZone);
  const slots = [...new Set(scheduleSlots)]
    .filter((slot) => /^([01][0-9]|2[0-3]):[0-5][0-9]$/.test(slot))
    .sort();
  const due = slots.filter((slot) => {
    const [hour, minute] = slot.split(":").map(Number);
    return hour * 60 + minute <= local.minutes;
  }).map((slot) => ({ localDate: local.localDate, slot }));

  // The shared cron runs hourly at :30. Carry the final local slot across midnight
  // once so a :45-:59 slot is not lost before the next hourly check.
  if (local.minutes <= 90) {
    const previousDate = new Date(`${local.localDate}T00:00:00.000Z`);
    previousDate.setUTCDate(previousDate.getUTCDate() - 1);
    const previousLocalDate = previousDate.toISOString().slice(0, 10);
    for (const slot of slots) {
      const [hour, minute] = slot.split(":").map(Number);
      const elapsed = 1440 - (hour * 60 + minute) + local.minutes;
      if (elapsed <= 90) due.push({ localDate: previousLocalDate, slot });
    }
  }

  return due.sort((left, right) => left.localDate.localeCompare(right.localDate) || left.slot.localeCompare(right.slot));
}

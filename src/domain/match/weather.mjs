/** Structured views of existing reference tables; effects stay in the content vault. */
export function weatherEntries(data, season = "Autumn") {
  const page = data.pages.find(item => item.title === "Weather");
  const part = page?.body.split(`## ${season}`)[1]?.split(/\n## /)[0] || "";
  return part.split("\n").filter(line => /^\|\s*(?:2|3|4|11|12)/.test(line)).map(line => {
    const cells = line.split("|").slice(1, -1).map(cell => cell.trim());
    return { roll: cells[0], name: cells[2], description: cells[3] };
  });
}

export function weatherResult(data, weather) {
  const sum = Number(weather.home) + Number(weather.away);
  if (!weather.home || !weather.away) return null;
  return weatherEntries(data, weather.season).find(entry => /4.*10/.test(entry.roll) ? sum >= 4 && sum <= 10 : Number(entry.roll) === sum) || null;
}

export function prayerEntries(data) {
  const page = data.pages.find(item => item.title === "Prayers to Nuffle");
  return (page?.body || "").split("\n").filter(line => /^\|\s*\d+\s*\|/.test(line)).map(line => {
    const cells = line.split("|").slice(1, -1).map(cell => cell.trim());
    return { roll: Number(cells[0]), name: cells[1], description: cells[2] };
  });
}

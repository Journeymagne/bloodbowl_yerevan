/** Search all reference pages, with named entries ahead of incidental mentions. */
export function searchPages(pages, query) {
  const needle = String(query).toLocaleLowerCase().replace(/\s+/g, " ").trim();
  if (!needle) return [];
  return pages.map((page, index) => {
    const title = String(page.title ?? "").toLocaleLowerCase();
    const body = [page.text, page.sectionLabel, ...(page.tags ?? [])].join(" ").toLocaleLowerCase();
    const rank = title === needle ? 0 : title.startsWith(needle) ? 1 : title.includes(needle) ? 2 : body.includes(needle) ? 3 : 4;
    return { page, rank, index };
  }).filter(item => item.rank !== 4)
    .sort((a, b) => a.rank - b.rank || a.index - b.index)
    .map(item => item.page);
}

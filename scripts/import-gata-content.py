import json
import os
import re
import shutil
import unicodedata
import zipfile
import xml.etree.ElementTree as ET
from pathlib import Path


ROOT = Path(__file__).resolve().parents[1]
OUT = ROOT / "content" / "Gata"
SOURCE = ROOT / "source"


def source_file(env_name, *names):
    if os.environ.get(env_name):
        return Path(os.environ[env_name])
    for name in names:
        candidate = SOURCE / name
        if candidate.exists():
            return candidate
    return SOURCE / names[0]


XLSX = source_file("GATA_XLSX", "Gata League 2_ Info.xlsx", "Gata League 2_  Info.xlsx")
RULES_DOCX = source_file("GATA_RULES_DOCX", "Gata League 2.0 ENG.docx")
CHANGELOG_DOCX = source_file("GATA_CHANGELOG_DOCX", "Gata League 2 Changelog ENG.docx")

XLS_NS = {
    "m": "http://schemas.openxmlformats.org/spreadsheetml/2006/main",
    "r": "http://schemas.openxmlformats.org/officeDocument/2006/relationships",
}
DOCX_NS = {"w": "http://schemas.openxmlformats.org/wordprocessingml/2006/main"}

SKILL_CATEGORIES = {
    "Agility": ["Catch", "Diving Catch", "Diving Tackle", "Dodge", "Defensive", "Hit and Run", "Jump Up", "Leap", "Safe Pair of Hands", "Sidestep", "Sprint", "Sure Feet", "Fumblerooskie", "Evasive"],
    "Devious": ["Dirty Player", "Eye Gouge", "Lethal Flight", "Lone Fouler", "Pile Driver", "Put the Boot In", "Quick Foul", "Saboteur", "Shadowing", "Sneaky Git", "Shiv"],
    "General": ["Block", "Dauntless", "Fend", "Frenzy", "Kick", "Pro", "Steady Footing", "Strip Ball", "Sure Hands", "Tackle", "Taunt", "Wrestle", "Offensive", "Elvenball"],
    "Mutation": ["Big Hand", "Claws", "Disturbing Presence", "Extra Arms", "Foul Appearance", "Horns", "Iron Hard Skin", "Monstrous Mouth", "Prehensile Tail", "Tentacles", "Two Heads", "Very Long Legs", "Bone Hook"],
    "Passing": ["Accurate", "Cannoneer", "Cloud Burster", "Dump-Off", "Give and Go", "Hail Mary Pass", "Leader", "Nerves of Steel", "On the Ball", "Pass", "Punt", "Safe Pass", "Strong Wrist"],
    "Strength": ["Arm Bar", "Brawler", "Break Tackle", "Bullseye", "Grab", "Guard", "Juggernaut", "Mighty Blow", "Multiple Block", "Stand Firm", "Strong Arm", "Thick Skull"],
}

TRAITS = {
    "Always Hungry", "Animal Savagery", "Animosity (X)", "Ball & Chain", "Ball and Chain", "Bloodlust", "Bloodlust (X+)",
    "Bombardier", "Bone-Head", "Bonehead", "Breathe Fire", "Chainsaw", "Decay", "Drunkard", "Hatred (Undead)",
    "Hatred (X)", "Hypnotic Gaze", "Insignificant", "Kick Team-Mate", "Kick Team-mate", "Loner (3+)", "Loner (4+)",
    "Loner (5+)", "Loner (X+)", "My Ball", "No Ball", "No Hands", "Pick-Me-Up", "Plague Ridden", "Pogo",
    "Projectile Vomit", "Really Stupid", "Regeneration", "Right Stuff", "Secret Weapon", "Stab", "Stunty", "Swoop",
    "Snail Sh...", "Take Root", "Throw Team-Mate", "Throw Team-mate", "Timmm-ber!", "Titchy", "Trickster", "Unchanneled Fury",
    "Unchannelled Fury", "Unsteady", "Thick Skull",
}

BBBASE_SKILLS_URL = "https://bloodbowlbase.ru/bb2025/core_rules/skills_and_traits/"


def ascii_text(value):
    text = "" if value is None else str(value)
    replacements = {
        "\u2011": "-", "\u2012": "-", "\u2013": "-", "\u2014": "-",
        "\u2018": "'", "\u2019": "'", "\u201c": '"', "\u201d": '"',
        "\u00a0": " ", "\ufffd": "-",
    }
    for src, dst in replacements.items():
        text = text.replace(src, dst)
    return unicodedata.normalize("NFKD", text).encode("ascii", "ignore").decode("ascii").strip()


def safe_name(value):
    cleaned = ascii_text(value)
    cleaned = re.sub(r'[<>:"/\\|?*]', "-", cleaned)
    cleaned = re.sub(r"\s+", " ", cleaned).strip().rstrip(".")
    return cleaned or "Untitled"


def wiki(value):
    return f"[[{ascii_text(value)}]]"


def md_table(headers, rows):
    lines = [
        "| " + " | ".join(headers) + " |",
        "| " + " | ".join(["---"] * len(headers)) + " |",
    ]
    for row in rows:
        lines.append("| " + " | ".join(ascii_text(cell).replace("\n", "<br>") for cell in row) + " |")
    return "\n".join(lines)


def read_docx(path):
    with zipfile.ZipFile(path) as zf:
        root = ET.fromstring(zf.read("word/document.xml"))
    paragraphs = []
    for para in root.findall(".//w:p", DOCX_NS):
        text = "".join(t.text or "" for t in para.findall(".//w:t", DOCX_NS)).strip()
        text = ascii_text(text)
        if text and not re.fullmatch(r"-+", text):
            paragraphs.append(text)
    return paragraphs


def col_to_num(ref):
    match = re.match(r"([A-Z]+)", ref or "")
    if not match:
        return 0
    number = 0
    for char in match.group(1):
        number = number * 26 + ord(char) - 64
    return number


def read_shared_strings(zf):
    try:
        root = ET.fromstring(zf.read("xl/sharedStrings.xml"))
    except KeyError:
        return []
    shared = []
    for item in root.findall("m:si", XLS_NS):
        shared.append("".join(t.text or "" for t in item.findall(".//m:t", XLS_NS)))
    return shared


def cell_value(cell, shared):
    typ = cell.attrib.get("t")
    if typ == "inlineStr":
        return ascii_text("".join(t.text or "" for t in cell.findall(".//m:t", XLS_NS)))
    value = cell.find("m:v", XLS_NS)
    if value is None:
        return ""
    raw = value.text or ""
    if typ == "s":
        try:
            return ascii_text(shared[int(raw)])
        except (IndexError, ValueError):
            return ascii_text(raw)
    if re.fullmatch(r"\d+\.0", raw):
        raw = raw[:-2]
    return ascii_text(raw)


def workbook_rows(path, sheet_name):
    with zipfile.ZipFile(path) as zf:
        shared = read_shared_strings(zf)
        workbook = ET.fromstring(zf.read("xl/workbook.xml"))
        rels = ET.fromstring(zf.read("xl/_rels/workbook.xml.rels"))
        relmap = {rel.attrib["Id"]: rel.attrib["Target"] for rel in rels}
        target = None
        for sheet in workbook.findall(".//m:sheet", XLS_NS):
            if sheet.attrib["name"] == sheet_name:
                rid = sheet.attrib["{http://schemas.openxmlformats.org/officeDocument/2006/relationships}id"]
                target = "xl/" + relmap[rid].lstrip("/")
                break
        if not target:
            raise RuntimeError(f"Sheet not found: {sheet_name}")
        root = ET.fromstring(zf.read(target))
        rows = []
        for row in root.findall(".//m:sheetData/m:row", XLS_NS):
            cells = {}
            for cell in row.findall("m:c", XLS_NS):
                cells[col_to_num(cell.attrib.get("r"))] = cell_value(cell, shared)
            if any(cells.values()):
                max_col = max(cells)
                rows.append([cells.get(index, "") for index in range(1, max_col + 1)])
        return rows


def parse_teams():
    rows = workbook_rows(XLSX, "Teams")
    teams = []
    current = None
    for row in rows:
        first = row[0] if row else ""
        if first and len(row) == 1:
            if current:
                teams.append(current)
            current = {"name": first, "roster": [], "tier": "", "rerolls": "", "apothecary": "", "rules": ""}
            continue
        if not current or not first or first == "Avalability":
            continue
        if first.startswith("Tier"):
            current["tier"] = first
            continue
        if "Team Rerolls" in row:
            current["rerolls"] = row[2] if len(row) > 2 else ""
            current["apothecary"] = row[7].replace("Avaliable", "Available") if len(row) > 7 else ""
            current["rules"] = row[8] if len(row) > 8 else ""
            continue
        if re.match(r"^0", first):
            current["roster"].append(row[:12] + [""] * max(0, 12 - len(row)))
    if current:
        teams.append(current)
    return teams


def parse_star_players():
    rows = workbook_rows(XLSX, "Star Players")
    groups = []
    current = None
    headers_seen = False
    for row in rows:
        first = row[0] if row else ""
        if not first:
            continue
        if first == "Name":
            headers_seen = True
            continue
        if not headers_seen or len(row) <= 3:
            if current:
                groups.append(current)
            current = {"name": first, "players": []}
            headers_seen = False
            continue
        if current:
            current["players"].append(row[:10] + [""] * max(0, 10 - len(row)))
    if current:
        groups.append(current)
    return groups


def collect_changelog_overrides(paragraphs):
    overrides = {}
    active = None
    for item in paragraphs:
        if item in {"Skills", "Teams", "Inducements", "General"}:
            active = item
            continue
        if active == "Skills":
            name = item.split(":", 1)[0].strip().rstrip(".")
            if 2 <= len(name) <= 40:
                overrides.setdefault(name, []).append(item)
    return overrides


def write(path, text):
    path.parent.mkdir(parents=True, exist_ok=True)
    path.write_text(text.strip() + "\n", encoding="utf-8")


def frontmatter(tags):
    return "---\ntags:\n" + "\n".join(f"  - {ascii_text(tag)}" for tag in tags if tag) + "\n---\n"


def generate_rules(paragraphs, changelog):
    rules_dir = OUT / "Rules"
    write(OUT / "Gata Blood Bowl League.md", """
Welcome to the Gata Blood Bowl League reference.

This site collects the league's Sevens rosters, star player availability, homebrew rulings, and team builder data.

Base game wording follows Blood Bowl 2025. For full base wording, use Blood Bowl Base as an external reference:
https://bloodbowlbase.ru/bb2025/
""")

    buckets = {
        "1. League Basics": [],
        "2. Team Creation": [],
        "3. Team Management": [],
        "4. Match Procedures": [],
        "5. Patch Notes": changelog,
    }
    current = "1. League Basics"
    for para in paragraphs:
        if para in {"Sevens Gata Blood Bowl League", "Rules", "General", "Aleksei Journey"}:
            continue
        if para in {"League Registration", "New Team Creation", "Team Creation", "Model Requirements"}:
            current = "2. Team Creation"
        elif para in {"Team Management", "Contracts", "Contract Renewal"}:
            current = "3. Team Management"
        elif para in {"Match Procedures", "League Formats"}:
            current = "4. Match Procedures"
        buckets.setdefault(current, []).append(para)

    for title, items in buckets.items():
        body = "\n\n".join(items)
        write(rules_dir / f"{title}.md", f"# {title}\n\n{body}")

    write(OUT / "General Information" / "Reference Sources.md", """
# Reference Sources

Gata Blood Bowl League is an unofficial fan league reference.

Base Blood Bowl 2025 wording is not reproduced wholesale here. When a rule is not changed by the Gata League documents, use the current Blood Bowl 2025 wording from Blood Bowl Base:

- https://bloodbowlbase.ru/bb2025/
- https://bloodbowlbase.ru/bb2025/core_rules/skills_and_traits/
""")


def generate_teams(teams):
    headers = ["Qty", "Position", "MA", "ST", "AG", "PA", "AR", "Skills", "Primary", "Secondary", "Cost", "Tags"]
    for team in teams:
        rows = []
        for roster in team["roster"]:
            skills = ", ".join(wiki(clean_link_name(part)) for part in re.split(r",|\n|<br\s*/?>", roster[7]) if clean_link_name(part))
            rows.append([roster[0], roster[1], roster[2], roster[3], roster[4], roster[5], roster[6], skills, roster[8], roster[9], roster[10], roster[11]])
        body = [
            md_table(headers, rows),
            "",
            f"**Rerolls:** {team['rerolls'] or '60K'}",
            f"**Apothecary:** {team['apothecary'] or 'No'}",
            f"**League:** {team['tier'] or 'League'}",
            f"**Special Rules:** {team['rules'] or '-'}",
        ]
        write(OUT / "Teams" / f"{safe_name(team['name'])}.md", "\n".join(body))


def generate_star_players(groups):
    index_files = []
    for group in groups:
        for player in group["players"]:
            name = player[0]
            if not name:
                continue
            skills = ", ".join(wiki(clean_link_name(part)) for part in re.split(r",|\n|<br\s*/?>", player[7]) if clean_link_name(part))
            keywords = player[9] if len(player) > 9 else ""
            body = [
                frontmatter(["Star Player", group["name"], *[t.strip() for t in keywords.split(",") if t.strip()]]),
                f"**Name:** {name}",
                f"**Availability:** {group['name']}",
                f"**Cost:** {player[6]}",
                "",
                md_table(["MA", "ST", "AG", "PA", "AR", "Cost", "Skills", "Keywords"], [[player[1], player[2], player[3], player[4], player[5], player[6], skills, keywords]]),
                "",
                f"**Special Ability:** {player[8] if len(player) > 8 else ''}",
            ]
            filename = f"{safe_name(name)}.md"
            index_files.append(filename.lower())
            write(OUT / "Star Players" / filename, "\n".join(body))
    write(OUT / "Star Players" / "_index.json", json.dumps({"generatedFrom": XLSX.name, "files": sorted(index_files)}, indent=2))


def normalize_skill_name(name):
    name = ascii_text(name).strip()
    name = re.sub(r"\s+", " ", name)
    aliases = {
        "Bone-Head": "Bonehead",
        "Bone-Head*": "Bonehead",
        "Ball & Chain": "Ball and Chain",
        "Throw Team-mate": "Throw Team-Mate",
        "Kick Team-mate": "Kick Team-Mate",
        "Unchanneled Fury": "Unchannelled Fury",
        "No Hands": "No Ball",
        "Dodge,": "Dodge",
    }
    return aliases.get(name, name)


def clean_link_name(name):
    name = ascii_text(name).strip()
    name = re.sub(r"\s+", " ", name)
    return name.strip(",")


def generate_skills_and_traits(teams, groups, overrides):
    seen = set()
    for team in teams:
        for row in team["roster"]:
            seen.update(clean_link_name(part) for part in re.split(r",|\n|<br\s*/?>", row[7]) if clean_link_name(part))
    for group in groups:
        for player in group["players"]:
            seen.update(clean_link_name(part) for part in re.split(r",|\n|<br\s*/?>", player[7]) if clean_link_name(part))
    for names in SKILL_CATEGORIES.values():
        seen.update(names)
    seen.update(TRAITS)
    seen.discard("")

    category_by_skill = {}
    for category, names in SKILL_CATEGORIES.items():
        for name in names:
            category_by_skill[name] = category

    for name in sorted(seen):
        base = "Loner (X+)" if name.startswith("Loner") else name
        is_trait = name in TRAITS or base in TRAITS or any(name.startswith(prefix) for prefix in ["Loner", "Hatred", "Animosity", "Bloodlust"])
        category = category_by_skill.get(name, category_by_skill.get(base, "General"))
        override_lines = overrides.get(name, []) + overrides.get(base, [])
        text = [
            frontmatter(["Passive" if "Passive" in name else "Active", category] if not is_trait else ["Trait"]),
            f"Base wording: use the Blood Bowl 2025 reference at {BBBASE_SKILLS_URL}",
        ]
        if override_lines:
            text.append("\n## Gata League change")
            text.extend(f"- {line}" for line in override_lines)
        folder = "Traits" if is_trait else "Skills"
        write(OUT / "Skills and Traits" / folder / f"{safe_name(base if is_trait else name)}.md", "\n".join(text))

    table_rows = []
    max_len = max(len(names) for names in SKILL_CATEGORIES.values())
    cats = list(SKILL_CATEGORIES.keys())
    for index in range(max_len):
        table_rows.append([wiki(SKILL_CATEGORIES[cat][index]) if index < len(SKILL_CATEGORIES[cat]) else "" for cat in cats])
    write(OUT / "Skills and Traits" / "Skill Table.md", md_table(cats, table_rows))


def main():
    resolved = OUT.resolve()
    if not str(resolved).startswith(str(ROOT.resolve())):
        raise RuntimeError(f"Refusing to write outside workspace: {resolved}")
    OUT.mkdir(parents=True, exist_ok=True)

    teams = parse_teams()
    stars = parse_star_players()
    rules = read_docx(RULES_DOCX)
    changelog = read_docx(CHANGELOG_DOCX)
    overrides = collect_changelog_overrides(changelog)

    generate_rules(rules, changelog)
    generate_teams(teams)
    generate_star_players(stars)
    generate_skills_and_traits(teams, stars, overrides)

    print(f"Generated {len(teams)} teams, {sum(len(g['players']) for g in stars)} star-player rows into {OUT}")


if __name__ == "__main__":
    main()

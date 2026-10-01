# Gata Blood Bowl League

<!-- impeccable:product-schema 1 -->

## Platform

web

## Users

Primary audience: existing league players. Confirmed by the user on 2026-09-08.
They use the site to consult the season, matches, results, teams and game rules.
New participants remain a secondary audience served by the existing league overview.

## Product Purpose

An unofficial Blood Bowl Sevens league site and reference for Gata in Yerevan.
It combines league-specific rules, team management and tournament tools.
The redesign should improve everyday use on desktop and mobile phones and make
the site feel like a carefully designed tabletop tournament platform.

## Capabilities and Constraints

Preserve the existing routes, account flows, team builder, saved rosters,
season standings, schedule, match tools, administration and reference materials.
The frontend uses JavaScript modules and CSS; preserve this stack.
English and Russian are complete product locales: translate every new UI string.
Content vault filenames and folders must mirror across both locales.
Do not fabricate fixtures, dates, scores, player counts or season status.
Preserve theme preferences and keyboard-accessible interactions.

## Brand Commitments

Keep the Gata league name and existing supplied emblem.
User requests a full visual redesign with a premium tabletop tournament character,
avoiding a generic AI-generated appearance. User selected “Club tournament journal”: navy, cool light surfaces, copper accents
and condensed sports typography. The implementation preserves this choice.

## Evidence on Hand

- `assets/brand/gata-league-logo.png` and its small variant.
- Localized reference vaults in `content/Gata/` and `content/Gata-ru/`.
- Existing reference and league overview copy, screens and API integrations.
- `docs/design-review-2026-09-08.md` records the initial design audit.

## Product Principles

1. Put existing players' tasks before promotional material.
2. Make rules easy to find during play.
3. Make tournament information and actions easy to scan on a phone.
4. Preserve product truth and equal functionality in both languages.

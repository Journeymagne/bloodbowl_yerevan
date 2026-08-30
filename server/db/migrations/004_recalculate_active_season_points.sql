-- Apply the three-casualty bonus to results already recorded in the active
-- season. New and edited results are calculated by matchPoints(); without this
-- migration, the standings would keep the old stored points until every match
-- was edited by hand.
--
-- Single-team rows are deliberately excluded: a bye or commissioner-awarded
-- result may carry points that cannot be derived from a played scoreline.

UPDATE season_pairings AS pairing
SET home_points =
      CASE
        WHEN pairing.home_touchdowns > pairing.away_touchdowns THEN 3
        WHEN pairing.home_touchdowns = pairing.away_touchdowns THEN 1
        ELSE 0
      END
      + CASE
          WHEN pairing.home_touchdowns > pairing.away_touchdowns
            AND pairing.home_touchdowns - pairing.away_touchdowns >= 3 THEN 1
          ELSE 0
        END
      + CASE
          WHEN pairing.home_touchdowns > 0 AND pairing.away_touchdowns = 0 THEN 1
          ELSE 0
        END
      + CASE WHEN COALESCE(pairing.home_casualties, 0) >= 3 THEN 1 ELSE 0 END,
    away_points =
      CASE
        WHEN pairing.away_touchdowns > pairing.home_touchdowns THEN 3
        WHEN pairing.away_touchdowns = pairing.home_touchdowns THEN 1
        ELSE 0
      END
      + CASE
          WHEN pairing.away_touchdowns > pairing.home_touchdowns
            AND pairing.away_touchdowns - pairing.home_touchdowns >= 3 THEN 1
          ELSE 0
        END
      + CASE
          WHEN pairing.away_touchdowns > 0 AND pairing.home_touchdowns = 0 THEN 1
          ELSE 0
        END
      + CASE WHEN COALESCE(pairing.away_casualties, 0) >= 3 THEN 1 ELSE 0 END
FROM season_rounds AS round
JOIN seasons AS season ON season.id = round.season_id
WHERE pairing.round_id = round.id
  AND season.status = 'active'
  AND pairing.result_type = 'played'
  AND pairing.home_entry_id IS NOT NULL
  AND pairing.away_entry_id IS NOT NULL
  AND pairing.home_touchdowns IS NOT NULL
  AND pairing.away_touchdowns IS NOT NULL;

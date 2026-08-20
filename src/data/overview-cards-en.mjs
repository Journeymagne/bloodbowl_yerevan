/**
 * League rules overview, English text.
 *
 * Mechanically moved out of src/app.js — same content, same shape. Task 10.4
 * of the refactor plan moves this into content/Gata/Overview/*.md so league
 * editors can change it without touching code; until then it lives here.
 */

export const overviewCards = [
  {
    slug: "code-of-conduct",
    title: "Code Of Conduct",
    summary: "Fair play, rollbacks, tilt control, reporting, and how to keep the match pleasant.",
    sections: [
      {
        title: "How to Be a Great Player",
        items: [
          "Play fair and with respect for your opponent.",
          "Rollbacks are allowed for any actions, but only before the dice are thrown.",
          "Control your frustration (tilt) over the dice rolls.",
          "Report match results to the organizer on time.",
          "Ask the organizer immediately if you have any questions about rules that you cannot find the answer to.",
          "Notify in advance if you cannot play your match on time.",
          "Enjoy the football!",
        ],
      },
    ],
  },
  {
    slug: "general-rules",
    title: "General Rules",
    summary: "League formats, match procedures, model standards, and basic registration rules.",
    sections: [
      {
        title: "League Formats",
        items: [
          "Season: A major event lasting about 3-4 months, with a defined start, end, and fixed roster of participants. Match schedules and times are strictly designated.",
          "Tournaments: Events played over 1-2 days, typically serving as season finales or fun cup events.",
          "Off-season: Friendly matches that can be played at any time, provided the team is not currently participating in another event. This is a great way to develop your team before the season. You may register up to 6 games per month in this format.",
          "Match results must be reported within 1-3 days of completion. Failure to comply may result in penalties, up to and including the annulment of match results.",
          "A single coach may register up to 4 teams in the league.",
          "If either player wishes, the game can be played with a clock. The standard format is 45 minutes per person. The timer stops for both players during pre-game preparations, kick-offs, and similar downtime.",
        ],
      },
      {
        title: "Match Procedures",
        items: [
          "Scheduling: For matches on designated game days, coaches must arrange the details with their opponents independently, using any convenient method.",
          "Reporting: Match results should be reported to the commissioner using any convenient method.",
          "Photos: It would be even better if you took some photos.",
        ],
      },
      {
        title: "Model Requirements",
        items: [
          "Free Starting Roster: As a personal incentive for participating, the Commissioner will provide you with 9 players - enough for a valid roster - from any 3D-printed team, completely free of charge.",
          "Model Standards: A model must clearly represent a team player, have a base, and be of an appropriate size.",
          "Identification: The player's number must be clearly marked on either the model or its base, matching the number listed on your team roster.",
          "Thematic Accuracy: Models must depict Blood Bowl players; weapons like swords, generic armor, etc., are not permitted.",
          "Conversions: Conversions are allowed.",
          "Clarification: If you are unsure whether your model is suitable for play, please consult the Commissioner.",
        ],
      },
      {
        title: "Registration",
        items: [
          "Whenever registration is open, go to Season and register a valid league team.",
        ],
      },
    ],
  },
  {
    slug: "general-rules-changes",
    title: "General Rules Changes",
    summary: "League-specific gameplay, SPP, setup, inducement, Team Value, and scoring adjustments.",
    sections: [
      {
        title: "Special Rules and Gameplay Changes",
        items: [
          "Prohibited Inducements: Special Hired Wizards, Biased Referees, and Famous Coaching Staff are not used in the league.",
          "Rules Adjustments: Some rules from the original Sevens and Blood Bowl have been modified for more enjoyable and deliberate gameplay. Most player costs have been recalculated; these changes can be viewed in the team table.",
        ],
      },
      {
        title: "General Gameplay Rules",
        items: [
          "MVP Selection: Choose 3 players and roll a d3 to decide which one receives 5 SPP.",
          "Kick-off: When the ball scatters on kick-off, roll 1d6 and halve the result (rounding down); the result can be zero.",
          "Team Rerolls: The cost of Team Rerolls is not doubled during team drafting, but it is doubled if purchased during the season.",
          "SPP for Knock Outs: A player who knocks out an opponent receives 1 SPP.",
          "Inducement Tiering: When determining inducement budgets, the team's tier is considered. Tier 2 teams receive 200k when playing against Tier 1; Tier 3 teams receive 300k against Premier League teams or 100k against Tier 2 teams.",
          "Injury Table: Use the injury table from the \"big format\" (standard) Blood Bowl.",
          "Setup: The team setup is moved 3 squares forward. Sevens now has a Line of Scrimmage. You must place at least 3 players on the Line of Scrimmage in the central segment. No more than 1 player is allowed in each side segment.",
          "Touchdown Restrictions: A touchdown cannot be scored on the first turn of any drive. If your player is in the opponent's end zone at the end of your first turn, you do not score, but if they are still there at the start of your second turn, the drive ends immediately and you score a touchdown. Exception: A touchdown can be scored on the first turn of a drive if the player was thrown via Throw Teammate.",
          "Leaping: Jumping over prone players is prohibited unless the player has the Leap skill.",
          "Mega-Stars: Star Players with the Mega-Star tag occupy both available Star Player slots.",
          "Bribes: Bribes trigger automatically.",
          "Secure the Ball!: The \"no ball pickup\" restriction radius is reduced to 1 square.",
          "Bribery and Corruption: Allows purchasing up to 3 bribes per team for 50k each, which increase Team Value (TV).",
          "TV Exceptions: Cheerleaders and assistant coaches do not count toward Team Value.",
          "Painting Bonus: A fully painted team receives an additional 15k after a match.",
          "Throw-Ins: Throw-ins are resolved using 1d6.",
        ],
      },
      {
        title: "Experience (SPP)",
        items: [
          "Block-like Actions: Actions similar to Block or their consequences grant SPP according to current rules (1 for KO, 2 for Injury). For example, Stab, Chainsaw, Bombardier, and pushing a player off the pitch can now grant experience.",
          "Fouls: A Foul action grants experience just like a Block.",
          "Throw Teammate: A Throw Teammate action grants the thrower experience for inflicting Injuries and KOs, just like a Block.",
        ],
      },
    ],
  },
  {
    slug: "skill-changes",
    title: "Skill Changes",
    summary: "League changes to skills, traits, mutations, SPP awards, and Favoured Of bonuses.",
    sections: [
      {
        title: "Skill Changes",
        items: [
          "Claws, Mighty Blow, and Piledriver: These skills now fully stack. With Claws and Mighty Blow, you break any armor on a 7+.",
          "Piledriver: Completely changed. After an armor roll from a Block action, the player using the skill can become Placed Prone to roll again. This does not work with skills that replace Block and has been moved to the Strength category.",
          "Hypnotic Gaze: Partially changed; can now only be used once per turn.",
          "Brawler: Completely changed; allows a one-time reroll of a single die during a Block. Cannot be used in negative dice blocks.",
          "Plague Ridden / Masters of Undeath: Completely changed; when a player with this rule kills an opponent, their coach gains a Lineman of their own team. Shambling Undead can choose between a Skeleton or a Zombie.",
          "Throw Teammate: Now a passive skill.",
          "Blood Lust: Roll a d6 after declaring any action. On a 2+, the turn continues normally. On a 1, the action is lost and the player must feed. The player may choose an adjacent teammate without the Vampire or Undead tags and perform an injury roll against them, treating all results as Badly Hurt. This causes a turnover only if the bitten player was holding the ball. Movement may be declared before the bite; after the bite, the player's activation ends. If no bite is performed, a turnover occurs.",
          "Accurate and Cannoneer: Merged into one skill, Accurate, which provides +1 to all passes.",
          "Dodge: Completely changed; now only allows a reroll for dodge tests.",
          "Evasive (New): The player can treat a result of 5 as 3–4 when being blocked, and Stumble results as Push Back.",
          "Tackle: Completely changed; it now ignores the Evasive skill.",
          "Arm Bar: Completely changed; prevents rerolls on dodge tests for players in the owner's tackle zone. Grants SPP like Block if the opponent is injured or knocked out while dodging away.",
          "Block: Partially changed; only works during the player's own activation.",
          "Thick Skull: Moved to the General category.",
          "Sneaky Git: You are no longer removed on doubles when fouling during an armor break.",
          "Stab: No longer ends movement during a Blitz.",
          "Shiv (New): Works like Stab but can only be used once per turn among all players with the skill.",
          "Decay: Completely changed; when receiving an injury, roll two dice and choose the highest.",
          "Safe Pass: Protects against any Fumble, not just on a natural 1.",
          "Fumblerooski: Moved to the Agility category.",
          "Pogo: Can only be used once per activation.",
          "Secret Weapon: Only works if the player was fielded for the drive.",
          "Shadowing: Now a General skill.",
          "Frenzy: Now optional; must be declared immediately before the first Block action of the activation.",
          "Monstrous Mouth: Limits holding to 1 player, or up to 2 when used with Multiple Block.",
          "Big Hand: Additionally allows picking up the ball from an adjacent square, but not while in an opponent's control zone.",
          "Disturbing Presence: Works on ball pickup, but still does not affect Secure the Ball. It does not work if the player is prone.",
          "Foul Appearance: Now triggers on a 1–2 roll and does not end the player's activation.",
          "Iron Hard Skin: Now grants +1 AV in addition to its basic properties; ignoring modifiers only works during a Block.",
          "Tentacles: Now works on a raw 4+ roll, regardless of the models' Strength.",
          "Bone Hook (New Mutation): Before a Foul action, you may move the target player 1 square to an adjacent cell before calculating assists.",
          "Leap: Now always works on an unmodifiable 4+ roll and is improved by the Very Long Legs mutation.",
          "Elvenball (New General Skill): Grants the ability to move after a Secure the Ball action.",
          "Guard: Now only works during the opponent's turn.",
          "Offensive (New General Skill): Grants an unblockable assist for a Block during your turn.",
          "Defensive: Now cancels the Offensive skill.",
          "Breathe Fire: Does not cause Knocked Down on a roll of 1.",
          "Diving Catch / On the Ball: Work when Punt is declared.",
          "Jump Up: Allows replacing Block with special actions such as Stab and declaring active skills while Prone.",
          "Multiple Block: Works on special actions that replace Block.",
          "Juggernaut: Also cancels Foul Appearance.",
          "Kick: Instead of a d3 roll, halve the d6 value during kick-off, rounding down; the result can be 0.",
          "Leader: Triggers at the start of a drive.",
        ],
      },
      {
        title: "Changes to Favoured Of…",
        items: [
          "Real Bonuses: The Favoured Of rule now provides actual bonuses.",
          "Deity Selection: If a team has a choice for this rule, select one option during team registration: Undivided, Khorne, Nurgle, Tzeentch, Slaanesh, or Hashut.",
          "Skill Acquisition: Every time a player receives an advancement, roll a d8.",
          "Triggers: Undivided triggers on 1; Slaanesh on 6; Nurgle on 7; Khorne on 8; Tzeentch on 9 (or 6); Hashut on 4.",
          "Additional Skill: A player may receive one skill corresponding to your choice in addition to the regular advancement. This skill increases the player's value, but does not increase the player's rank.",
          "Random Selection: If a player has Mutation access only as a secondary skill or has no Mutation access, choose the skill randomly.",
        ],
      },
      {
        title: "Favoured Of Skill Lists",
        items: [
          "Undivided: Prehensile Tail, Extra Arm, Disturbing Presence.",
          "Tzeentch: Two Heads, Extra Arm, Very Long Legs.",
          "Khorne: Horns, Iron Hard Skin, Prehensile Tail.",
          "Slaanesh: Tentacles, Foul Appearance, Extra Arm.",
          "Nurgle: Tentacles, Monstrous Mouth, Bone Hook.",
          "Hashut: Iron Hard Skin, Horns, Bone Hook.",
        ],
      },
    ],
  },
  {
    slug: "create-your-team",
    title: "Create Your Team",
    summary: "Starting budget, roster limits, specialists, registration, and model expectations.",
    sections: [
      {
        title: "New Team Creation",
        items: [
          "Starting Budget: Teams are drafted with 600,000 gold pieces in accordance with the base rules.",
          "Roster Size: The team size is limited to 14 players.",
          "Specialists: In Sevens, a team can field no more than 4 specialists per drive, so be sure to purchase at least 3 players with the Lineman tag.",
          "Registration: Create a new team on this website, then enter its name and logo.",
        ],
      },
      {
        title: "Model Requirements",
        items: [
          "Model Standards: A model must clearly represent a team player, have a base, and be of an appropriate size.",
          "Identification: The player's number must be clearly marked on either the model or its base, matching the number listed on your team roster.",
          "Thematic Accuracy: Models must depict Blood Bowl players; weapons like swords, generic armor, etc., are not permitted.",
          "Conversions: Conversions are allowed.",
          "Clarification: If you are unsure whether your model is suitable for play, please consult the Commissioner.",
          "Painting: It is highly encouraged to play with a painted team. A miniature is considered painted if all details are highlighted, base shadows and highlights have been applied, and the base is finished.",
        ],
      },
    ],
  },
  {
    slug: "team-management",
    title: "Team Management",
    summary: "Team transfers, player sales, contracts, renewals, recovery, and roster retention.",
    sections: [
      {
        title: "Team Management",
        items: [
          "Team Transfer: You may transfer a team from the previous season without any restrictions.",
          "Players: Players can be sold after a match for half their price.",
          "Roster Constraints: You cannot sell or remove a player if doing so would leave the team with fewer than 7 players.",
        ],
      },
      {
        title: "Contracts",
        items: [
          "Contract Terms: Upon team formation, the coach signs a contract with the team. The contract renewal time is announced by the Commissioner and typically occurs at the end of the season.",
          "Team Buyout: To purchase the team from the league treasury, 600,000 gold will be allocated, plus the funds in the team's treasury at the time of renewal, up to a total maximum of 900,000 gold.",
          "Agent Fees: A player who has completed a contract will incur an additional 20,000 gold in agent fees for each contract completed after the first. For example, after 3 successful contracts, a player will cost 40,000 more to buy out. This increase is not counted toward the total team value.",
          "Player Departure: Players who do not sign a contract leave the team.",
          "Retention: After signing a new contract, a player retains all experience, acquired skills, and injuries.",
          "Dissolution: You may dissolve your team and choose not to renew the contract if you wish.",
        ],
      },
      {
        title: "Contract Renewal — Health Recovery",
        items: [
          "Healing Niggling Injuries: Roll a d6 for each Niggling Injury; add a +1 modifier if you have an Apothecary. On a 4+, the vacation and rest work wonders, and the injury is successfully healed. If you fail, the injury remains with the player.",
          "Healing Serious Injuries: Roll a d6 for each stat reduction on the player; add a +1 modifier if you have an Apothecary. On a 4+, the treatment is successful, the characteristic is restored to its previous value, and the player receives a Niggling Injury. If you fail, the injury remains with the player.",
          "Removing Hatred: Roll a d6 for each acquired Hatred skill on the player. On a 4+, the player forgets their old grudges, and the skill is removed from the player's profile.",
        ],
      },
      {
        title: "Contract Renewal — Staff & Personnel",
        items: [
          "Assistant coaches, cheerleaders, and apothecaries go on unpaid leave.",
          "Rerolls are lost.",
          "Select the players you wish to keep on the team and pay their cost, plus any applicable agent fees.",
          "Remove the remaining players. Count the number of upgrades the departing players had and roll that many d6s; for every 1–2 rolled, you lose one Fan Factor.",
          "Purchase new players, staff, and rerolls as needed.",
        ],
      },
    ],
  },
  {
    slug: "season-structure-and-scoring",
    title: "Season Structure and Scoring",
    summary: "Round deadlines, league points, rookie protection, prizes, and tournament structure.",
    sections: [
      {
        title: "Match Conduct",
        items: [
          "Rounds: One round lasts two weeks, starting on a Monday and ending on a Sunday.",
          "Deadlines: Each match must be played within its designated round.",
          "Locations: Games can be played at the Litch Club, at Ded Max's Painting Evenings, or at someone's home by prior arrangement.",
          "Virtual Play: If it is impossible to play in real life, the match can be played using the Tabletop Simulator (TTS) mod.",
          "Scheduling: Time proposals for matches must be submitted by the end of Friday. If a coach only provides scheduling proposals over the weekend and the match is ultimately not played, the Commissioner will favor the coach who provided their availability in advance.",
          "Incomplete Matches: If a match is not played within the round, the result will be determined by the Commissioner.",
          "Season Start: At the beginning of the season, all missed game penalties are removed from all players.",
        ],
      },
      {
        title: "League Points",
        items: [
          "3 points for a win.",
          "1 point for a draw.",
          "0 points for a loss.",
          "+1 point if the game ends with a margin of 3+ touchdowns.",
          "+1 point if you conceded 0 touchdowns (you must score at least one yourself).",
          "+1 point if you caused 4 or more casualties.",
        ],
      },
      {
        title: "End-of-Season Prizes",
        items: [
          "At the end of the season, all teams not in the top rankings receive winnings.",
          "10k for each match played.",
          "20k for each victory.",
          "10k for each draw.",
        ],
      },
      {
        title: "Rookie Protection",
        items: [
          "For the first 3 games after a team's creation, all injuries inflicted on its players are counted as Badly Hurt.",
        ],
      },
      {
        title: "Tournament Structure",
        items: [
          "Tournament Bracket: Matches are assigned using the Swiss system.",
          "Tie-breakers: The Buchholz coefficient and head-to-head results are used for tie-breakers, followed by the total number of touchdowns and injuries.",
          "Playoff Qualification: Depending on the number of participants, the players at the top of the standings will receive an automatic bye into the tournament's playoff winner's bracket.",
        ],
      },
    ],
  },
];

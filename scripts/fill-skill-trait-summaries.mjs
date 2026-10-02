import { readFileSync, readdirSync, writeFileSync } from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";

const rootDir = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..");
const baseUrl = "https://bloodbowlbase.ru/bb2025/core_rules/skills_and_traits/";
const baseLink = `[Blood Bowl 2025 skills and traits reference](${baseUrl})`;
const placeholder = `Base wording: use the ${baseLink}`;

function key(name) {
  return name
    .toLowerCase()
    .replace(/&/g, " and ")
    .replace(/\.\.\./g, "")
    .replace(/[^a-z0-9]+/g, " ")
    .replace(/\s+/g, " ")
    .trim();
}

const summaries = new Map();
function add(names, summary) {
  for (const name of Array.isArray(names) ? names : [names]) {
    summaries.set(key(name), summary);
  }
}

add("Accurate", "When this player makes a Quick Pass or Short Pass, they may add +1 to the Passing Ability test.");
add("Arm Bar", "If an opponent Falls Over while Dodging, Jumping or Leaping away from this player's tackle zone, this player may add +1 to that opponent's Armour or Injury roll. If that causes a Casualty, this player is credited for SPP.");
add("Big Hand", "This player ignores negative modifiers when attempting to pick up the ball.");
add("Block", "When a Both Down result is applied in a Block involving this player, they may choose not to be Knocked Down.");
add(["Bone Head", "Bone-Head", "Bonehead"], "After declaring an action, roll a D6. On 2+ the player acts normally; on 1 they become Distracted and the activation ends.");
add("Bone Hook", "Gata mutation. Before this player performs a Foul Action, they may move the target player one square so that the target is adjacent to the active player; resolve this before counting foul assists.");
add("Brawler", "When this player declares a Block Action, they may re-roll one Both Down result from that block.");
add("Break Tackle", "Once per turn when this player Dodges, they may add a Strength-based bonus to the Agility test: +1 at ST 3 or less, +2 at ST 4, or +3 at ST 5 or more.");
add("Bullseye", "When this player performs a Throw Team-mate Action, a Superb Throw lets the thrown player land in the target square without scattering. The player needs Throw Team-mate to take this skill.");
add("Cannoneer", "When this player makes a Long Pass or Long Bomb, they may add +1 to the Passing Ability test.");
add("Catch", "This player may re-roll a failed Agility test made to catch the ball.");
add("Chaotic Impulse", "Gata trait. This player moves like a Ball and Chain player; if they collide with another player, do not make a Block Action and apply a Push Back result instead.");
add("Claws", "When this player Knocks Down an opponent during a Block Action, a natural armour roll of 8+ breaks armour regardless of the target's Armour value.");
add("Cloud Burster", "When this player performs a Pass Action, opposing players cannot attempt to Intercept the ball.");
add("Dauntless", "When blocking a stronger opponent, roll D6 and add this player's ST. If the total is higher than the opponent's unmodified ST, treat this player's unmodified ST as equal to the opponent's for that block.");
add("Defensive", "During the opponent's turn, opposing players Marked by this player cannot use Guard or Put the Boot In. In Gata League, Defensive also cancels Offensive.");
add("Dirty Player", "When this player Fouls, they may add +1 to either the Armour roll or the Injury roll after seeing the roll.");
add("Disturbing Presence", "Opponents within 3 squares of this player suffer -1 per such player when passing, throwing a team-mate or bomb, catching, or intercepting.");
add("Diving Catch", "This player may try to catch a Pass, Throw-in or Kick-off that lands in their tackle zone, but not a Bounce. If they are in the target square for a Pass Action, they also get +1 to the catch test.");
add("Diving Tackle", "After an opponent attempts to Dodge, Jump or Leap away from this player's tackle zone, this player may become Prone in the vacated square to apply -2 to that Agility test. Only one Diving Tackle can affect a single escape attempt.");
add("Dodge", "Once per turn this player may re-roll one Agility test made to Dodge. In base rules it also affects Stumble results; in Gata League that defensive part is handled by Evasive.");
add("Dump-Off", "When this player is targeted by a Block Action or direct Special Action, they may make a Quick Pass before the action resolves. That pass cannot itself cause a Turnover.");
add("Elvenball", "Gata General skill. After this player performs a Secure the Ball Action, they may continue moving with any movement they still have available.");
add("Evasive", "Gata Agility skill. When this player is blocked, Stumble results are treated as Push Back, and the dedicated defensive block result is treated as a normal push result. Tackle cancels this skill.");
add("Explosive Demise", "Gata trait. Any Injury-table result for this player is treated as Dead. When the player dies, resolve a bomb explosion in their square, then place two Brimstone Horrors in the nearest available squares.");
add("Extra Arms", "This player may add +1 to Agility tests to catch, pick up or intercept the ball.");
add("Eye Gouge", "When this player Pushes Back an opponent, that opponent cannot provide Offensive or Defensive Assists until after their next activation.");
add("Fend", "When this player is Pushed Back by a Block Action, the blocking player may not Follow-up. It does not work against Ball and Chain or a Blitzing player using Juggernaut.");
add(["Foul Appearance", "Foul Apearance"], "An opponent that declares a Block Action or direct Special Action against this player must roll first. On a failed roll, the action is cancelled and the opponent's activation ends.");
add("Frenzy", "When this player blocks and Pushes Back a standing target, they must Follow-up if able and then make a second Block against the same target if possible. It cannot be combined with Grab, Hit and Run, or Multiple Block.");
add(["Fumblerooskie", "Fumblerooski"], "During a Move Action while carrying the ball, this player may place the ball on the ground in a square they move out of without causing a Turnover.");
add("Give and Go", "After this player makes a Quick Pass or Hand-off without causing a Turnover, their activation does not end; they may keep moving with any remaining movement.");
add("Grab", "When this player blocks and Pushes Back an opponent, this player's coach may choose any available adjacent square for the push. Opponents cannot use Sidestep against this player's Block Actions, and this skill cannot be combined with Frenzy.");
add("Guard", "This player may provide Offensive and Defensive Assists for Blocks even while Marked by opposing players.");
add("Hail Mary Pass", "This player may target any square on the pitch with a Pass or Throw Bomb action, treating the throw as a Long Bomb. Accurate results become inaccurate, and the throw cannot be intercepted.");
add("Hit and Run", "After this player completes a Block Action or Stab Special Action and remains Standing, they may move one free square ignoring tackle zones, ending clear of all opposing marks. This skill cannot be combined with Frenzy.");
add("Horns", "When this player declares a Blitz Action, they add +1 ST for any Block Actions made during that Blitz.");
add("Iron Hard Skin", "Opponents cannot apply Armour-roll modifiers against this player, and Claws cannot be used against them.");
add("Juggernaut", "During a Blitz Action, this player may treat Both Down as Push Back on their Block Actions. Targets of those Blitz blocks cannot use Fend, Stand Firm or Wrestle.");
add("Jump Up", "This player may stand up from Prone for free. They may also declare a Block Action while Prone; pass an Agility test with +1 to stand and block, or fail and end the activation Prone.");
add("Kick", "If this player is the nominated kicker, the coach may reduce kick deviation from D6 squares to D3 squares.");
add("Leader", "While at least one player with Leader is available on the pitch at the relevant start timing, the team may gain one Leader re-roll. It is lost if all Leader players leave play before it is used.");
add("Leap", "During movement, this player may Leap over one adjacent square. Resolve it like a Jump, but reduce the negative modifier by 1, to a minimum of -1. This skill cannot be combined with Pogo.");
add("Lethal Flight", "When this player is thrown by Throw Team-mate and knocks down an opponent on landing or bouncing, they may add +1 to either Armour or Injury. Casualties caused this way award SPP to the thrown player. Requires Right Stuff.");
add("Lone Fouler", "When this player Fouls with no Offensive or Defensive Assists involved, they may re-roll a failed Armour roll.");
add(["Mighty Blow", "Mighty Blow (+1)"], "When this player Knocks Down an opponent during a Block Action, they may add +1 to either the Armour roll or Injury roll after seeing the roll.");
add("Mighty Blow (+2)", "When this player Knocks Down an opponent during a Block Action, they may add +2 to either the Armour roll or Injury roll after seeing the roll.");
add("Monstrous Mouth", "This player may make a Chomp Special Action against a standing opponent they Mark. On 3+, the opponent is Chomped and cannot leave while still Marked by this player. Strip Ball also cannot be used against this player.");
add("Multiple Block", "This player may Block two different adjacent opponents at once, reducing their ST by 2 for the blocks. They cannot Follow-up, and the skill cannot be combined with Frenzy.");
add("Nerves of Steel", "This player ignores modifiers for being Marked when attempting to catch the ball or make a Passing Ability test.");
add(["No Hands", "No hands"], "This player cannot take possession of the ball. Any catch, pick-up or interception attempt automatically fails as if a natural 1 had been rolled.");
add("Offensive", "Gata General skill. During your turn, this player can provide a block assist that cannot normally be cancelled; Defensive cancels this skill.");
add("On the Ball", "When an opponent declares a Pass Action, this player may move up to 3 squares before the pass roll, without Rushing. One open receiving player with this skill may also move up to 3 squares after kick deviation and before the kick-off event, unless a touchback occurs.");
add("Pass", "This player may re-roll a failed Passing Ability test when performing a Pass Action.");
add(["Pick-Me-Up", "Pick-me-up"], "At the end of each opponent turn, roll for Prone team-mates within 3 squares of a standing player with this rule. On 5+, the Prone player may immediately stand up.");
add(["Pile Driver", "Piledriver"], "After this player Knocks Down an opponent during a Block Action, they may make a free Foul Action against that opponent if still standing and Marking them, then this player becomes Prone and their activation ends.");
add(["Prehensile Tail", "Prehesile Tail"], "When an opponent attempts to Dodge, Jump or Leap away from this player's tackle zone, apply an extra -1 to the Agility test. Only one Prehensile Tail can affect a single escape attempt.");
add("Pro", "During this player's activation, they may try to re-roll one eligible die, dice pool or die from a multi-dice roll. On 3+ the re-roll is allowed; after trying Pro, the same roll cannot be re-rolled from another source.");
add("Punt", "This player may make a Punt Special Action after moving. If carrying the ball, kick it using the throw-in template for direction and distance; the ball bouncing loose is not a Turnover, but the crowd or an opposing catch is.");
add("Put the Boot In", "This player may give an Offensive Assist to a team-mate's Foul Action even while Marked by opposing players.");
add("Quick Foul", "After this player performs a Foul Action, their activation does not end and they may continue moving with any movement they still have.");
add(["Regeneration", "Regenearation"], "When this player suffers a Casualty, roll before the Casualty roll. On 4+ the casualty is ignored and the player goes to Reserves; on 1-3, resolve the casualty normally.");
add(["Right Stuff", "Right stuff"], "This player can be thrown by a team-mate using Throw Team-mate, even if this player is Prone.");
add("Saboteur", "When this player is Knocked Down by an opposing Block Action, roll before their Armour roll. On 4+ the sabotaged weapon also Knocks Down the attacker, then this player is automatically Knocked Out. Requires Secret Weapon.");
add("Safe Pair of Hands", "If this player would become Prone while holding the ball, they may place the ball in an adjacent empty square before becoming Prone instead of letting it bounce.");
add("Safe Pass", "If this player rolls a natural 1 on a Passing Ability test, the pass is not fumbled. The player keeps the ball, their activation ends, and no Turnover is caused.");
add("Secret Weapon", "At the end of any drive in which this player took part, they are Sent-off, even if they are no longer on the pitch when the drive ends.");
add("Shadowing", "When an opponent Dodges out of this player's tackle zone, this player may roll. On 4+ they move into the square the opponent left. Uses per turn are limited by this player's MA.");
add("Shiv", "Gata skill. Works like Stab, but only one player with Shiv on the team may use it each turn.");
add(["Side Step", "Sidestep"], "When this player is Pushed Back, their coach chooses the destination from available adjacent squares instead of the opposing coach.");
add(["Snail Sh", "Snail Sh..."], "Gata trait. At the start of activation, after any Very Stupid check, this player may hide in or come out of its shell. While hidden, MA becomes 0 and AV becomes 11+, and the player cannot receive adjacent-player bonuses for Very Stupid checks.");
add("Sneaky Git", "When this player Fouls and rolls natural doubles on the Armour roll, they are not Sent-off if the target's armour is not broken. If armour is broken, the normal sending-off rules apply.");
add("Sprint", "When this player makes a Move Action, they may attempt one extra Rush beyond the normal limit.");
add("Stand Firm", "When this player would be Pushed Back during a Block Action or chain push, they may stay in their current square instead. Frenzy can still continue if this player remains standing.");
add("Steady Footing", "Whenever this player would be Knocked Down or Fall Over, roll a D6. On 6, they remain standing; if this happens during their activation, they may continue and no Turnover is caused.");
add("Strip Ball", "When this player Blocks a ball-carrier and Pushes them Back, the ball is dropped in the pushed-to square and bounces before the target becomes Prone, if applicable.");
add("Strong Arm", "When this player performs a Throw Team-mate Action, they may add +1 to the Passing Ability test. Requires Throw Team-mate.");
add("Strong Wrist", "Gata Passing skill. This player is better at difficult ball handling and may apply the league's Strong Wrist passing bonus where the roster or event rules call for it.");
add("Sure Feet", "Once per turn this player may re-roll one failed Rush roll.");
add("Sure Hands", "This player may re-roll a failed pick-up roll, but not a Secure the Ball Action. Strip Ball cannot be used against this player.");
add("Tackle", "Opponents Dodging away from this player's tackle zone cannot use Dodge. When this player Blocks, the target cannot count Dodge against Stumble results. In Gata League, Tackle also cancels Evasive.");
add("Taunt", "When this player is Pushed Back by a Block Action, this player's coach may force the opponent to Follow-up. It cannot force a Rooted Take Root player to move.");
add("Tentacles", "When an opponent tries to Dodge, Jump or Leap away from this player, this player may roll using ST to hold them in place. Success ends the opponent's movement in the square they tried to leave.");
add(["Thick Skull", "Thick skull"], "This player treats some Knocked-out Injury results as Stunned instead. If they also have Stunty, the adjusted Stunty injury thresholds apply.");
add(["Timm-ber!", "Timmm-ber!"], "If this player has MA 2 or less and tries to stand up, add +1 to the stand-up roll for each open standing team-mate adjacent to them. A natural 1 still fails.");
add("Two Heads", "This player may add +1 to Agility tests when attempting to Dodge.");
add("Very Long Legs", "This player may add +1 to Agility tests to Jump or Leap and +2 to Interception tests. They also ignore Cloud Burster.");
add("Very Stupid", "Use Really Stupid-style activation. After declaring an action, roll D6; with a suitable adjacent standing team-mate the roll gets +2. On 4+ act normally; on failure the player becomes Distracted.");
add("Wrestle", "When this player is involved in a Block and Both Down is applied, they may choose to place both players Prone, ignoring skills that would otherwise keep either player standing.");

add("Always Hungry", "Before throwing a team-mate, this player must roll. On 2+ continue normally; on 1, roll again. The second roll either makes the team-mate squirm free for a fumbled throw or be eaten and removed, causing a Turnover if they had the ball.");
add("Animal Savagery", "After declaring an action, roll D6 with +2 for Block or Blitz. On 4+ act normally; on failure, Knock Down an adjacent standing team-mate if possible, otherwise this player becomes Distracted.");
add(["Animosity", "Animosity (X)", "Animosity (All)", "Animosity (Underworld Goblin Linemen)"], "When this player tries to Pass or Hand-off to a team-mate covered by the Animosity keyword, roll D6. On 1, the player refuses and their activation ends. Animosity (All) applies to every team-mate.");
add(["Ball and Chain", "Ball & Chain"], "This player can only take a Ball and Chain Special Action. They move randomly with the throw-in template, automatically dodge away, crash into players, push prone players, bounce the ball, and risk Injury by the Crowd if they leave the pitch.");
add(["Bloodlust", "Bloodlust (X+)"], "Before activation, roll against the listed Bloodlust target number, with +1 for Block or Blitz. On failure the player may continue, but must bite an adjacent Thrall Lineman by the relevant point or cause a Turnover and become Distracted.");
add("Bombardier", "This player may make a Throw Bomb Special Action. Bombs are thrown like passes, explode if they land or are dropped, knock down standing players hit by the blast, and force a caught bomb to be thrown again immediately.");
add("Breathe Fire", "This player may make a Breathe Fire Special Action against a standing adjacent opponent. Roll D6 with -1 against ST 5+ targets; high results place the target Prone or Knocked Down, and the action ends the activation.");
add("Chainsaw", "This player may make a Chainsaw Attack Special Action against an adjacent opponent, usually making an Armour roll with +3. On a kick-back or if this player is knocked down/falls over, the chainsaw makes them much easier to injure. It can also be used on Fouls.");
add("Decay", "Apply +1 to Casualty rolls made against this player.");
add("Drunkard", "This player suffers -1 when attempting to Rush.");
add(["Hatred", "Hatred (X)", "Hatred (Big Guy)", "Hatred (Dwarf)", "Hatred (Ogre)", "Hatred (Troll)", "Hatred (Undead)"], "When this player Blocks a player with the listed keyword, they may re-roll one Player Down result.");
add("Hypnotic Gaze", "This player may make a Hypnotic Gaze Special Action after moving. Choose an adjacent standing opponent; on a successful roll that opponent becomes Distracted and this player's activation ends.");
add("Insignificant", "When building a roster, you cannot include more players with Insignificant than players without it.");
add("Kick Team-Mate", "This player may make a Kick Team-mate Special Action. It works like Throw Team-mate, but does not use the team's Throw Team-mate action for the turn; a fumbled kick injures the kicked player more harshly.");
add(["Loner (X+)", "Loner (X+) Thick Skull", "Loner (4+)"], "When this player wants to use a Team re-roll, roll D6. If the result meets or beats the listed target, the re-roll may be used; otherwise the re-roll is lost and the original result stands.");
add("My Ball", "This player may not willingly give up the ball. They cannot Pass, Hand-off, or use abilities that voluntarily relinquish possession; they lose it only by being taken down or by an opponent's effect.");
add("No Ball", "This player can never possess the ball, automatically fails attempts to catch or pick it up, and cannot attempt interceptions.");
add("Plague Ridden", "Once per game, if this player kills an eligible opposing player with a Block Action and the death is not saved, add a new Lineman from this team roster to Reserves. It may be hired after the game like a Journeyman.");
add("Pogo", "During movement, this player may Pogo over one adjacent square like a Jump while ignoring the usual negative jump modifiers. This trait cannot be combined with Leap.");
add("Projectile Vomit", "This player may make a Projectile Vomit Special Action against an adjacent standing opponent. On 2+ make an unmodified Armour roll against the target; on 1 make the same unmodified Armour roll against this player.");
add("Really Stupid", "After declaring an action, roll D6. Add +2 if an eligible standing non-Distracted team-mate is adjacent. On 4+ act normally; on 1-3 this player becomes Distracted.");
add("Stab", "This player may make a Stab Special Action against an adjacent standing opponent. Make an unmodified Armour roll; if armour breaks, roll Injury. It can replace the Block in a Blitz, but then the activation ends.");
add("Stunty", "This player ignores negative modifiers for being Marked when Dodging, suffers -1 when trying to Intercept, and uses the Stunty Injury Table when injured.");
add("Swoop", "When thrown by Throw Team-mate, this player may replace normal scatter with a throw-in-template direction and distance roll, and may re-roll the landing test.");
add("Take Root", "When activated while standing, roll D6. On 2+ act normally; on 1 the player becomes Rooted, cannot move, follow up, be pushed back, or leave the square until knocked down, placed prone, removed, or the drive ends.");
add("Throw Team-Mate", "This player may perform the Throw Team-mate Action. Use the normal Throw Team-mate procedure for picking up and throwing an eligible team-mate.");
add("Titchy", "This player gets +1 to Dodge tests, but does not impose the normal -1 marking modifier on opponents dodging into their tackle zone.");
add("Trickster", "When targeted by a Block Action or most direct Special Actions, this player may be removed and placed in another empty square adjacent to the attacker before the action resolves. If placed on the ball, they may try to pick it up first.");
add(["Unchannelled Fury", "Unchanneled Fury"], "After declaring an action, roll D6 with +2 for Block or Blitz. On 4+ act normally; on 1-3 the player's activation ends immediately.");
add("Unsteady", "This player may not declare Secure the Ball Actions.");

const targetDirs = [
  path.join(rootDir, "content", "Gata", "Skills and Traits", "Skills"),
  path.join(rootDir, "content", "Gata", "Skills and Traits", "Traits"),
];

const files = targetDirs.flatMap((dir) =>
  readdirSync(dir)
    .filter((file) => file.endsWith(".md"))
    .map((file) => path.join(dir, file)),
);

const missing = [];
let changed = 0;

for (const file of files) {
  const name = path.basename(file, ".md");
  const summary = summaries.get(key(name));
  if (!summary) {
    missing.push(name);
    continue;
  }

  const replacement = `## Rule summary\n${summary}\n\nFull reference: ${baseUrl}`;
  const current = readFileSync(file, "utf8");
  const next = current
    .replace(placeholder, replacement)
    .replace(/(- .+)\r?\n\1/g, "$1");

  if (next !== current) {
    writeFileSync(file, next, "utf8");
    changed += 1;
  }
}

console.log(`changed=${changed}`);
if (missing.length > 0) {
  console.error(`missing=${missing.join(", ")}`);
  process.exitCode = 1;
}

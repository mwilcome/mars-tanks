# Mars Tanks

A widescreen artillery duel in the browser. You and one other tank share a side-view map. Fuel is limited, hills cost more going up, and you do not get a rangefinder. You set an angle and a power, fire one shell, and live with the result.

The worlds are not Earth. Gravity, air, and wind come from the body you are standing on. The Moon throws shells farther than Mars. Titan's air kills speed. Phobos barely has a down. Geysers, ice, and lava show up where the ground actually has them.

There are 30 fixed maps. A campaign walks them in order against the CPU. Skirmish is any world, against the CPU or a friend on the same screen.

## Play

Serve the folder. ES modules do not run from `file://`.

```bash
python3 -m http.server 8080
```

Then open `http://127.0.0.1:8080`.

Phones need landscape. A portrait window is asked to rotate. Every command is an on-screen button.

| Action | Keyboard | Screen |
| --- | --- | --- |
| Drive | A / D | Hold ◀ ▶ |
| Angle | Left / right | − / + or the slider |
| Power | Up / down | − / + or the slider |
| Fire | Space, Enter, or F | FIRE |
| Weapon | 1–8 | Weapon chips |

Drive, aim, and fire are all available on your turn. There is no separate aim lock.

A new campaign starts with a short fuel tank (34), weak traction, 100 hull points, and HE only. Winning a map pays credits and opens the depot before the next world. Fuel, traction, armor, and the gun are bought there. The other weapons unlock after a set number of cleared maps, and the shells you buy stay in the magazine. They are not refilled on the next map. The enemy stays on that opening tank. Skirmish still issues a full tank and every weapon, refilled each battle, and it does not touch the campaign save.

Easy, Normal, and Hard each keep their own map, credits, and purchases in local storage on this device. REPLAY TOUR runs the maps again and keeps what you bought. NEW CAMPAIGN on the title asks once, then erases that difficulty and starts at the first world. A fuel cache on the map refills about two thirds of your tank.

Angle `0` is flat to the right, `90` is straight up, `180` is flat to the left. The barrel points there. It does not draw the arc.

Wind, when a world has air, pushes positive to the right. Vacuum shows no wind and no drag. A hurt tank drives slower, leaks fuel, and its power dial caps out lower. Shells fuse after 9 seconds.

### Depot

Costs are the price of the next rank. The first number in each list is free.

| Upgrade | Ranks | Cost of each step |
| --- | --- | --- |
| Fuel tank | 34, 45, 56, 67, 78, 89, 100 | 40, 75, 120, 175, 240, 320 |
| Traction | 72%, 79%, 86%, 93%, 100% | 50, 95, 150, 220 |
| Armor | 100, 120, 140, 160, 180 HP | 60, 110, 170, 250 |
| Gun | +0, +8, +16, +24 power | 45, 90, 150 |

| Weapon | After maps | Unlock, includes | More ammo |
| --- | --- | --- | --- |
| Penetrator | 1 | 80, 2 shells | 2 for 30 |
| Ricochet | 2 | 110, 2 shells | 2 for 32 |
| Siege | 4 | 170, 1 shell | 1 for 28 |
| Cluster | 6 | 210, 1 shell | 1 for 26 |
| Ion | 8 | 250, 1 shell | 1 for 34 |
| Mole | 10 | 310, 1 shell | 1 for 36 |
| Plasma | 13 | 390, 1 shell | 1 for 32 |

An easy win on map 1 with 100 damage, 2 hits in 3 shots pays 189: 55 for the win, 80 for damage, 24 for accuracy, 30 for the kill. Normal multiplies that by 1.12 (212). Hard multiplies by 1.3 (246). Later maps add 6 to the win pay per map already cleared. That first purse buys the first fuel rank (40) and the Penetrator (80) with a shell pack left over. It does not buy Plasma. A centered easy HE shell is about 102 damage, so the first armor rank (120 HP) lives through one.

## Deploy

The site is static. No build step.

On Netlify, set the publish directory to the repository root and leave the build command empty. `netlify.toml` already says that. Connecting this GitHub repo, or dragging the folder onto Netlify, is enough.

A link can open a world directly: `/?map=titan&vs=cpu` or `/?map=europa&vs=p2`.

Hidden test links, not shown in the menus:

- `/?level=5` starts campaign map 5 (1-based) with the purchases saved for the current difficulty. A new save is still the short tank and HE only. Winning advances that save and opens the depot.
- `/?debug=1` (or `/?upgrades=1`) banks 4,000 credits, maxes fuel and traction, and unlocks every weapon with 12 shells. Armor and the gun stay where they were, so the depot still has something to buy. The grant is written into the campaign save. It leaves you on the title; open DEPOT.
- `/?level=1&debug=1` starts map 1 with that grant. The enemy stays on the short tank and HE only.
- `/?map=titan&vs=cpu` is still a skirmish: full tank, every weapon, no campaign purse.

## Tests

```bash
npm test
```

That checks map generation, gravity, drag, wind, fuel, damage, and one full aim-and-fire turn.

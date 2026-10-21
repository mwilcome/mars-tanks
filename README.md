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

Campaign maps start with a short fuel tank and a lower hill limit. Both rise as you clear worlds. Skirmish issues a full tank. A fuel cache on the map refills about two thirds of that tank.

Angle `0` is flat to the right, `90` is straight up, `180` is flat to the left. The barrel points there. It does not draw the arc.

Wind, when a world has air, pushes positive to the right. Vacuum shows no wind and no drag. A hurt tank drives slower, leaks fuel, and its power dial caps out lower. Shells fuse after 9 seconds.

HE shells are unlimited. Everything else is a small magazine that refills when you start a map.

## Deploy

The site is static. No build step.

On Netlify, set the publish directory to the repository root and leave the build command empty. `netlify.toml` already says that. Connecting this GitHub repo, or dragging the folder onto Netlify, is enough.

A link can open a world directly: `/?map=titan&vs=cpu` or `/?map=europa&vs=p2`.

Hidden test links, not shown in the menus: `/?level=5` starts campaign map 5 (1-based) with that map's fuel and climb. `/?debug=1` gives the last-map fuel tank and hill limit on the next battle. Combine them: `/?level=1&debug=1`. Winning a `level` link advances the saved campaign.

## Tests

```bash
npm test
```

That checks map generation, gravity, drag, wind, fuel, damage, and one full aim-and-fire turn.

# Map artwork license

The board map is adapted from **"Diplomacy.svg" by Martin Asal**, published on
Wikimedia Commons:
<https://commons.wikimedia.org/wiki/File:Diplomacy.svg>

The original is licensed under the
[Creative Commons Attribution-ShareAlike 3.0 Unported license (CC BY-SA 3.0)](https://creativecommons.org/licenses/by-sa/3.0/)
(it is also offered under the GNU Free Documentation License; this project uses
it under CC BY-SA 3.0).

## What is derived from it

`src/map/geometry.ts` is a derivative work of that map. It was generated from
the SVG by `scripts/extract-map.mjs` and changes the original as follows:

- province outlines, supply-centre positions and label positions were extracted
  and re-keyed to this project's province ids;
- Spain, St Petersburg and Bulgaria, drawn as two shapes each, were merged into
  single outlines, and the North Sea and Norwegian Sea shapes were clipped to
  their visible area;
- label positions were re-centred, and unit anchor positions were computed
  and partly hand-placed;
- the map is restyled (colours, strokes, fonts, unit and order graphics) by the
  app at render time.

`src/map/geometry.ts`, and any map image rendered from it, is distributed under
**CC BY-SA 3.0**. If you redistribute or adapt it, credit Martin Asal, link the
license, indicate your changes, and share your adaptation under the same license.
The app shows the attribution line
"Map: Martin Asal, CC BY-SA 3.0 (Wikimedia Commons), adapted" under the board.

## Everything else

All other code in this repository, including `scripts/extract-map.mjs`, is
licensed under the MIT License (see `LICENSE`).

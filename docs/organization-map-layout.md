# Organization map layout

## Research and design

The former layout put domains and organizations on independent circles, then pushed overlapping cards apart. This left long links across the middle of the map and sometimes through unrelated cards. Adjusting only the link anchors could not fix those positions.

[Obsidian's Graph view](https://obsidian.md/help/plugins/graph) exposes center, repel, link, and link-distance forces. [D3's force simulation](https://d3js.org/d3-force/simulation) and [link force](https://d3js.org/d3-force/link) describe the same settled spring model. [Graphviz's neato layout](https://graphviz.org/docs/layouts/neato/) separates spring placement from overlap removal, while its [spline guidance](https://graphviz.org/docs/attrs/splines/) routes edges around nodes after positions are known. These sources informed the layout; the app uses a small deterministic implementation suited to its rectangular cards and three node types.

The map now settles links, repels nearby nodes, pushes unrelated cards away from link corridors, and resolves rectangle collisions. A spatial grid limits nearby pair checks. After placement, each edge keeps its side-center anchors. If a straight edge intersects another card, a visibility search finds a short path around that card with rounded bends. A grid search and alternative side anchors handle crowded cases where the short visibility route has no clear path. An unobstructed edge stays straight.

The simulation runs to completion before render. Cards and links update together, including on hover, so an animation cannot temporarily detach an edge from a card. The existing viewport fit, minimum readable zoom, panning, keyboard access, and domain focus remain in place. Trackpad pinch or Ctrl+wheel zoom and the +/− buttons use faster steps.

## Verification

The layout tests cover collision clearance, deterministic placement, horizontal and vertical anchors, a link obstructed by a third card, and a crowded graph with 100 nodes. A local SVG fixture based on the reviewed map screenshot was visually inspected. The signed-in production map still needs a browser check with the team's actual data after deployment.

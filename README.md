# Linux Ancestry

A family tree of Linux distributions, from 1991 to now.

https://linuxancestry.ls0775.com

Around 1,100 distributions listed on DistroWatch are drawn as a tree. You can
view it as a timeline (x axis is the year of first release) or as a radial map
(distance from the centre is the year). Click a distro to see its parents and
children; drag the year slider to watch families appear and die off.

This grew out of [LinuxTimeline](https://github.com/ls0775/LinuxTimeline) and
the static SVG produced by
[jappeace/distrowatch1graph1svg](https://github.com/jappeace/distrowatch1graph1svg).
Distribution data and relationships come from the
[DistroWatch family tree](https://distrowatch.com/dwres.php?resource=family-tree).

## Running it

You need Node 24 (see `.nvmrc`). There is a dev container in `.devcontainer/`
if you would rather not install anything locally.

    npm install
    npm run dev

`npm run lint` runs tsc and eslint, `npm test` runs the unit tests and
`npm run build` writes the site to `dist/`.

## How it is put together

- `src/` is a React app. `App.tsx` loads `public/distros.json` and hands it to
  one of two D3 views, `FamilyTree.tsx` (timeline) or `RadialTree.tsx`.
- Both views build their SVG once and then update it in place, so zooming and
  selecting do not redraw the whole tree.
- Every distro hangs off a virtual "Linux" root. If a parent is missing or
  filtered out, the child is attached to the root instead of disappearing.
- `scraper/` holds the Python scripts that fetch the data from DistroWatch and
  write `public/distros.json`. A full run takes about five hours because
  DistroWatch asks for a 15 second delay between requests. See
  [scraper/README.md](scraper/README.md).
- Logos live in `public/logos/` so the site does not lean on DistroWatch at
  runtime.
- The look follows [docs/design.md](docs/design.md): off-white page, dark
  grey text, no shadows or animation.

Pushing to `master` runs the GitHub Actions workflow, which lints, tests,
builds and deploys to Azure Static Web Apps.

## Data and attribution

The data is from DistroWatch.com and is used here for non-commercial,
educational purposes. If you spot a wrong parent or date, open an issue or
edit `public/distros.json` directly; hand edits to descriptions and parentage
survive a re-scrape.

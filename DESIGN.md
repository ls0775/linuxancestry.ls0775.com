# Design system: calm, light

A small, reusable set of rules for plain static sites. Copy this file into another
repo (or point an AI assistant at it) and say "apply DESIGN.md".

Reference implementation: `index.html` and `style.css` in ls0775/ls0775.com.

## Principles

1. **Calm.** Nothing moves unless the user moves it. No entrance animations,
   hover lifts, parallax, particles or background effects.
2. **Light.** Warm off-white page, dark grey text. No dark mode by default.
3. **Flat.** No cards, borders-as-boxes, shadows, blur, gradients or glows.
   Separate things with whitespace and hairline rules only.
4. **One column.** A single narrow, left-aligned column of prose. Never centre
   body text.
5. **Plain links.** Underlined, same colour as text. Hover only darkens the
   underline. No buttons for navigation.
6. **Quiet hierarchy.** Headings are small and light-weight. Hierarchy comes from
   spacing, colour (`--muted`) and letter-spacing, not from size or boldness.
7. **No JavaScript** unless the page genuinely needs it to function.
8. **Subtract first.** When unsure, remove decoration rather than add it.

## Tokens

All colours live in `:root`. Never hardcode a colour elsewhere.

| Token              | Value     | Use                                  |
| ------------------ | --------- | ------------------------------------ |
| `--bg`             | `#faf9f6` | page background (warm off-white)     |
| `--text`           | `#2b2a27` | body text, headings, links           |
| `--muted`          | `#6f6c66` | descriptions, labels, footer links   |
| `--rule`           | `#e4e1da` | hairline separators                  |
| `--link`           | `#2b2a27` | link text (same as `--text`)         |
| `--link-underline` | `#b8b3a8` | resting underline colour             |

Typography:

| Element   | Size        | Weight | Notes                                          |
| --------- | ----------- | ------ | ---------------------------------------------- |
| body      | `1.0625rem` | 400    | line-height `1.65`                             |
| `h1`      | `1.5rem`    | 400    | site name, not a display heading               |
| intro `p` | body        | 300    | `--muted`                                      |
| `h2`      | `0.8rem`    | 400    | uppercase, `letter-spacing: 0.08em`, `--muted` |
| list desc | `0.95rem`   | 300    | `--muted`                                      |
| footer    | `0.95rem`   | 400    | `--muted`, darkens on hover                    |

Font: **Outfit**, self-hosted, weights 300 and 400 only. Fall back to the system
stack. Never load fonts from a CDN.

Layout:

- `main { max-width: 34rem; margin: 0 auto; }`
- Body padding `4rem` top/bottom on desktop, `2.5rem` on `< 600px`; `1.5rem`
  sides. Always wrap in `max(..., env(safe-area-inset-*))`.
- Section gap `3rem`. List item padding `0.9rem 0`.
- Lists: `list-style: none`, `border-top: 1px solid var(--rule)` on each item,
  `border-bottom` on the last.

Interaction:

- Only transition: `text-decoration-color 0.15s ease`. Disabled under
  `prefers-reduced-motion`.
- Focus: `outline: 2px solid var(--text); outline-offset: 3px`.

## Page skeleton

```html
<main>
    <header>
        <h1>Site name</h1>
        <p>One or two sentences, in the first person, plain language.</p>
    </header>

    <section aria-labelledby="x-heading">
        <h2 id="x-heading">Section label</h2>
        <ul class="projects">
            <li>
                <a href="…">Thing</a>
                <span>One-line description</span>
            </li>
        </ul>
    </section>

    <footer>
        <nav aria-label="Elsewhere">
            <a href="…" rel="me">GitHub</a>
        </nav>
    </footer>
</main>
```

Head: `theme-color` = `--bg`. Keep `<title>` to the bare site name. Drop
`keywords` meta and any taglines like "digital space".

## Starter stylesheet

Copy as `style.css`. Add `@font-face` blocks for `fonts/outfit-300.ttf` and
`fonts/outfit-400.ttf` above `:root`.

```css
:root {
    --bg: #faf9f6;
    --text: #2b2a27;
    --muted: #6f6c66;
    --rule: #e4e1da;
    --link: #2b2a27;
    --link-underline: #b8b3a8;
    --font: 'Outfit', -apple-system, BlinkMacSystemFont, 'Segoe UI', Roboto, sans-serif;
}

* { box-sizing: border-box; margin: 0; padding: 0; }

html, body { min-height: 100%; overscroll-behavior: none; }

body {
    background: var(--bg);
    color: var(--text);
    font-family: var(--font);
    font-size: 1.0625rem;
    line-height: 1.65;
    min-height: 100vh;
    min-height: 100svh;
    padding: max(4rem, env(safe-area-inset-top))
             max(1.5rem, env(safe-area-inset-right))
             max(4rem, env(safe-area-inset-bottom))
             max(1.5rem, env(safe-area-inset-left));
}

main { max-width: 34rem; margin: 0 auto; }

header { margin-bottom: 3rem; }
h1 { font-size: 1.5rem; font-weight: 400; margin-bottom: 1rem; }
header p { font-weight: 300; color: var(--muted); }

h2 {
    font-size: 0.8rem;
    font-weight: 400;
    text-transform: uppercase;
    letter-spacing: 0.08em;
    color: var(--muted);
    margin-bottom: 1rem;
}

a {
    color: var(--link);
    text-decoration: underline;
    text-decoration-color: var(--link-underline);
    text-decoration-thickness: 1px;
    text-underline-offset: 0.2em;
    transition: text-decoration-color 0.15s ease;
}
a:hover { text-decoration-color: var(--text); }
a:focus-visible { outline: 2px solid var(--text); outline-offset: 3px; border-radius: 2px; }

.projects { list-style: none; }
.projects li {
    display: flex;
    flex-direction: column;
    gap: 0.15rem;
    padding: 0.9rem 0;
    border-top: 1px solid var(--rule);
}
.projects li:last-child { border-bottom: 1px solid var(--rule); }
.projects span { font-size: 0.95rem; font-weight: 300; color: var(--muted); }

footer { margin-top: 3rem; }
footer nav { display: flex; gap: 1.5rem; font-size: 0.95rem; }
footer nav a { color: var(--muted); }
footer nav a:hover { color: var(--text); }

@media (max-width: 600px) {
    body {
        padding-top: max(2.5rem, env(safe-area-inset-top));
        padding-bottom: max(2.5rem, env(safe-area-inset-bottom));
    }
}

@media (prefers-reduced-motion: reduce) {
    a { transition: none; }
}
```

## Applying to an existing site (checklist)

- [ ] Delete background canvases, particle scripts and any JS not needed for function
- [ ] Replace `:root` with the tokens above; remove every other hardcoded colour
- [ ] Remove `backdrop-filter`, `box-shadow`, `filter`, `background-clip: text`,
      gradients, `border-radius` on containers, and all `@keyframes`
- [ ] Remove `transform` on hover/active; keep only underline-colour transitions
- [ ] Convert button-style links to plain underlined links
- [ ] Convert card grids to a plain `<ul>` with hairline rules
- [ ] Left-align everything; wrap in `main { max-width: 34rem }`
- [ ] Shrink `h1` to `1.5rem` / weight 400; make `h2` a small uppercase label
- [ ] Keep only font weights 300 and 400; remove unused `@font-face` and files
- [ ] Update `theme-color`, `<title>`, and OG/Twitter copy; regenerate `og-image.png`
- [ ] Keep `overscroll-behavior`, `100svh`, safe-area padding, `prefers-reduced-motion`
- [ ] Update `CLAUDE.md` / `copilot-instructions.md` to reference this file

# Vistaprint Raised Foil Vectorizer

**Vectorize your logo on Vistaprint and get raised foil on your own design.** An
open-source Claude Code skill that turns your logo, text or low-resolution PNG into native
**Vistaprint Studio vector shapes**: same position, exact hex colours, crisp at any size,
and eligible for **raised foil** (silver or gold) on business cards and raised foil
postcards.

[![Code: Apache-2.0](https://img.shields.io/badge/code-Apache--2.0-blue.svg)](LICENSE)
[![Docs: CC BY 4.0](https://img.shields.io/badge/docs-CC%20BY%204.0-lightgrey.svg)](LICENSE-DOCS)
[![Fonts: OFL 1.1](https://img.shields.io/badge/fonts-OFL%201.1-green.svg)](assets/fonts/OFL.txt)

*Résumé en français plus bas : [En français](#en-français).*

## The problem

Vistaprint's [raised foil FAQ](https://www.vistaprint.com/business-cards/raised-foil) says
you cannot upload your own design and add raised foil to it: raised foil comes on its
pre-designed templates only. In the Studio, the Finishes panel offers foil on **editor
elements** (text and shapes), never on an uploaded image. Upload your logo as a PNG and you cannot foil it; upload it at
72 ppi and your business card prints blurry.

Redrawing a logo by hand in the Studio is not realistic, and the Studio has no "import SVG
as shapes" button. On some products (raised foil postcards) a blank design does not even
let you choose which elements get foil: the Finishes panel only offers "Text only / Image
only / Text and images" and a note to Vistaprint's team.

## What this skill does

It converts your artwork into the editor's own **curve shapes**, through the Studio's own
command API, so that:

- your logo and text become vector shapes the Finishes panel accepts for **raised foil**;
- small text and thin lines print sharp, whatever the resolution of the original upload;
- colours are set to the exact hex values of your brand (`rgb()` as the Studio stores them);
- everything stays editable and undoable in the Studio, like shapes you drew yourself.

Sources, from best to last resort:

1. **SVG exports** (Illustrator, Figma, Inkscape): pieces are extracted with their
   transforms, strokes and paint order, then fitted on what you see in the Studio.
2. **Fonts**: text is recomposed with fontTools + HarfBuzz (kerning, ligatures), its size,
   tracking and baseline fitted to your image, glyph by glyph. Epilogue (variable, roman
   and italic) is bundled; any font file you are licensed to use works.
3. **Tracing**: sub-pixel isocontours for artwork with no vector source.

Every outline is made **even-odd safe** (Vistaprint fills with the even-odd rule, which
turns the overlapping contours of variable fonts into holes, so letters look clipped) and
written with explicit path commands.

## How it works

1. **Read.** Claude opens your design in Vistaprint Studio (your own session) and lists
   every side, image and shape. It reads the text from an enlarged view rather than guessing.
   For a product without per-element foil (raised foil postcards), **you first pick a
   Vistaprint template that already has raised foil**: it unlocks the per-element Finishes
   panel. Claude never chooses the template for you.
2. **Prepare.** Outlines are built locally in Python from your SVG, your font or the image.
3. **Fit.** Each piece is rendered and compared with your image pixel by pixel; scale,
   position and letter spacing are adjusted until it lines up.
4. **Inject.** The shapes go in through the editor's own commands, first in a test colour
   to check the overlay, then in your exact colours.
5. **Verify, then replace.** Pixel difference, an even-odd check, the "Saved" state and a
   page reload. Only then is the image removed.
6. **Foil and clean up.** Foil is ticked per shape in the Finishes panel. On a template,
   everything that came with it (text boxes, background, lines) is deleted on both sides,
   the design is saved, reloaded and compared pixel by pixel with your SVGs. You review the
   proof; ordering stays with you.

## Safety and transparency

Claude works in your browser, logged in to your Vistaprint account. Here is exactly what
that means.

**What Claude sees.** The Vistaprint pages open in your session: your design, its images
and the text on your card, plus any account page it opens. It also reads the files you give
it (SVG, PNG, fonts).

**What it can do.** Edit the design you named through the Studio's own commands: add,
recolour or replace shapes, tick foil on your shapes in the Finishes panel, remove an image
once its replacement is verified, and delete the stock elements of a template you opened. It writes
working files and a session log on your computer.

**What it never does.** Add to cart, update the cart, check out or pay. Open a site other
than Vistaprint. Follow instructions found in a page, a file or a design name. Download a
font without asking you first. Publish anything.

**Safeguards built into the skill (toolkit 0.1.0):**

- *Removal gate.* `vp.removeImage()` keeps the image when a measured pixel difference is
  above its limit or the even-odd check fails. Claude must then stop and ask you; it can
  go ahead only with your own words from the chat, which are written to the log.
- *Session log.* Date, skill commit, toolkit version, model and design, plus every removal
  or refusal with its numbers (template removals list every deleted id), in
  `private/session-log.md` on your computer.
- *Template choice stays yours.* Claude waits for you to open the foil template; it never
  picks one, and it only deletes the template's stock elements, never your shapes.
- *Domain guard.* The in-page toolkit refuses to run outside Vistaprint domains.
- *Private folder.* `private/` is git-ignored: your notes and artwork stay out of any
  repository.

**Recommended on your side:**

- In Claude in Chrome, give site access to Vistaprint only.
- Keep no payment card saved in the Vistaprint account Claude works in, so that paying is
  impossible, not just forbidden.
- Review the proof yourself before ordering.

## Who it's for

- Small businesses and freelancers who want **raised foil business cards** from their own
  logo on Vistaprint, without paying for a designer to rebuild it.
- Designers who deliver an SVG or a PNG and need it as Studio shapes.
- Anyone whose Vistaprint card looks **blurry** because the logo was uploaded at low
  resolution.

## Measured results

On four real business cards (front and back) and on synthetic tests:

| Element | Fit |
|---|---|
| Logo letters from SVG | 0.36 % pixel difference |
| Bold text recomposed from the font | 2.7-3.3 % |
| 7 pt light text | 7-11 % (anti-aliasing of 4 px strokes; Illustrator's own outlines score about 6 %) |
| Tracking recovered on a synthetic line | exact (-0.44 pt), max glyph error 0.0065 pt |
| Tracing an anti-aliased circle | 0.13 px mean error |
| 6 x 9 in raised foil postcard, 43 shapes from two SVG layers | 0.11 % of pixels differ by more than 10 levels (288 ppi), all on anti-aliased edges |

## Requirements

- [Claude Code](https://docs.claude.com/en/docs/claude-code) with browser control
  (Claude in Chrome, or the built-in browser of the Claude desktop app), logged in to your
  own Vistaprint account.
- Python 3.10+ and `pip install fonttools uharfbuzz skia-pathops pillow numpy`.

## Install

Claude Code (all your projects):

```bash
git clone https://github.com/Factero-Advisory/vistaprint-raised-foil-vectorizer ~/.claude/skills/vistaprint-raised-foil-vectorizer
```

claude.ai or the Claude desktop app: zip the folder and upload it as a custom skill in your
settings (Capabilities, Skills). Browser automation is needed for the Studio part.

## Use

Open your design in Vistaprint Studio, then ask Claude, for example:

- "Vectorize the PNG on the back of my Vistaprint card, no foil on the text."
- "Rebuild my logo from this SVG as shapes and put raised silver foil on it."
- "The A and the 4 look clipped on my card, fix it."
- "Change the phone number on my colleague's card to 514-555-0199."
- "Set the text to #B8B8BE exactly."
- "I opened a raised foil postcard template: put my two SVG layers in it, gold foil on the
  ornaments only, and delete everything from the template."

The skill also understands French requests ("vectorise mon logo", "carte d'affaires",
"finition Raised Foil").

## FAQ

**Can I get raised foil on an uploaded logo on Vistaprint?**
Not as an image: the Finishes panel only offers foil on text and shapes. Once this skill has
rebuilt the logo as Studio shapes, the foil option appears for each shape.

**Why is my logo blurry on my Vistaprint business card?**
It was most likely uploaded as a low-resolution image (a 72 ppi PNG is only about 260 px
wide for a whole card). Shapes are vectors: they print sharp at any size.

**Do I need Adobe Illustrator?**
No. An SVG export from any tool gives the best result, but the skill can also recompose
text from a font file and trace artwork straight from the image.

**Does it work with gold foil?**
Yes. Foil is applied per shape in the Finishes panel, silver or gold, as Vistaprint offers
for your product.

**Does it work on raised foil postcards?**
Yes, from a template. A blank postcard only offers "Text only / Image only / Text and
images", with no per-shape choice. Open any Vistaprint raised foil postcard template
yourself: the panel then lists every element. The skill puts your vectors in, ticks foil on
the right shapes, then deletes all the template's own content.

**Will it order or change my cart?**
Never. It edits the design in your own session, and the cart, checkout and payment stay
with you. Review the proof before ordering.

**Is foil good on very small text?**
Vistaprint asks for text of 13 pt or larger for raised foil. Fine lines and small text can be
vectorized for sharpness but are better left without foil.

## Repository layout

```
SKILL.md                 instructions Claude follows
scripts/vp_toolkit.js    in-page toolkit (engine access, fitting, tracing, checks, repair,
                         SVG placement, foil ticking, template cleanup, pixel check)
scripts/*.py             composition, SVG pieces, overlap cleaning, weight identification, tracing
references/              editor internals, worked examples, fitting, fonts, pitfalls, API
assets/fonts/            Epilogue variable fonts + OFL
examples/                sample composition spec
```

## Limits and disclaimers

- Independent project, **not affiliated with, endorsed or sponsored by Vistaprint or
  Cimpress**. Vistaprint is a trademark of its respective owner.
- It relies on undocumented internals of the Studio, which can change at any time.
- Use it on your own designs, in your own session, and review the proof before ordering.
  It never orders, pays or updates a cart. Read Vistaprint's terms of use.
- Foil quality depends on Vistaprint's process: very thin lines and small text may not
  foil well.

## En français

**Vectoriser son logo sur Vistaprint et obtenir le fini Raised Foil sur son propre design.**
Ce skill open source pour Claude Code transforme un logo, un texte ou un PNG basse
résolution en formes vectorielles natives de Vistaprint Studio. Le résultat garde la même
position et les couleurs hexadécimales exactes, il reste net à l'impression et il devient
admissible au Raised Foil (argent ou or) sur les cartes d'affaires et les cartes postales
Raised Foil.

Vistaprint refuse le Raised Foil sur une image téléversée : le panneau Finishes ne l'offre
que sur le texte et les formes. Le skill reconstruit donc l'image en formes par les
commandes du Studio. Il part d'un SVG, d'une police ou d'un tracé de l'image. Il cale chaque
pièce au pixel près, vérifie le résultat, puis retire l'image. Si un écart mesuré dépasse
sa limite, l'image reste en place et Claude doit vous demander quoi faire. L'outil ne
fonctionne que sur les pages de Vistaprint et tient un journal de chaque séance sur votre
ordinateur. Pour une carte postale Raised Foil, vous ouvrez d'abord vous-même un modèle
Vistaprint qui a déjà du Raised Foil : c'est lui qui permet de choisir le fini élément par
élément. Le skill insère vos vecteurs, coche le foil sur les bonnes formes, supprime tout
le contenu du modèle (boîtes de texte, fond, lignes), enregistre, recharge et compare au
pixel avec vos SVG. La commande et le paiement restent toujours entre vos mains. Les demandes en français fonctionnent (« vectorise mon
logo », « mets le Raised Foil sur le logo seulement »).

## Licence

- Code: [Apache License 2.0](LICENSE)
- Documentation: [CC BY 4.0](LICENSE-DOCS), attribution "Factero (factero.ca)"
- Fonts: Epilogue, [SIL Open Font License 1.1](assets/fonts/OFL.txt)

See [NOTICE](NOTICE).

## About

Built by [Factero](https://factero.ca), an independent cybersecurity and IT compliance
firm in Québec, Canada, while redesigning its own business cards.

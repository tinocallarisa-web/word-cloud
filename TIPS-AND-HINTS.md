# Word Cloud by TCViz — Tips & Hints (v1.0.0.0)

A word cloud answers one question: **what are people talking about?** This page is the short
version of everything worth knowing.
Full documentation, with search: https://tinocallarisa-web.github.io/word-cloud/support.html

---

## Quick start

1. **You already have words** (keywords, products, tags): drag that column to **Words**.
2. **You have sentences** (survey comments, tickets, reviews): drag that column to **Text (free text)**.
3. Optional: a measure in **Size**. Without it, each word counts how often it appears.

> **The most common surprise:** Power BI groups identical texts before they reach any visual, so
> with Size empty the answer "Good" counts once even if 200 people wrote it. Put the response ID
> in Size as **Count** and every response counts.

---

## Field wells

| Well | Kind | What it does |
|---|---|---|
| **Words** | Grouping | One word or phrase per row. A hierarchy here enables drilldown. |
| **Text (free text)** | Grouping | Sentences the visual splits into words. Use Words or Text, not both. |
| **Size** | Measure | Weight of each word. Empty: number of occurrences. |
| **Color value** | Measure | Gradient or sentiment colour. In Text mode, the average of the rows with the word. |
| **Tooltips** | Measure | Extra values on hover. |
| **Shape image** | Measure | A Base64 image from the model: words fill its dark area. |

---

## Free text

- **Detect languages automatically** (on) finds English, Spanish, Portuguese, French, German and
  Italian and removes their stopwords. Ticked languages are always used.
- **Minimum word length** (3), **Exclude words** (comma-separated) and **Include two-word phrases**
  ("late delivery", "customer service").
- Clicking a word in Text mode filters the **comments that contain it**.
- Drilldown needs a hierarchy, so it works with Words, not with free text.

---

## Sentiment without DAX

1. Drag the score to **Color value** and choose **Average** in its field menu (not Sum).
2. Colors → Color by → **Sentiment**.
3. Colors → **Neutral value**: the score that shows as grey — 5.5 for a 1–10 score, 0 for −1 to 1.

Each word takes the average score of the comments that mention it: red words come with complaints,
green ones with praise. If the score is being summed, the warning icon says so.

---

## Shapes

- **Rectangle, Circle, Ellipse, Diamond, Triangle, Hexagon**, **42 icons**, your own **Text**
  (words fill the letters) or an **Image** from the model.
- **Show shape** draws a light silhouette; **Shape border** an outline just outside it.
- **Fill the shape** adds small repeats of your words so the outline reads; they are decoration
  only and never counted.
- **Stretch shape to fill** off keeps the proportions of the icon, text or image.
- For your logo: store it as Base64 text (`data:image/png;base64,…`), put it in Shape image and set
  Shape to Image. Web links are not loaded.

---

## Format pane

- **Style template** — Clean, Bold, Editorial, Monochrome, Poster. Your own settings win.
- **Words** — maximum words (150, up to 1,000), font sizes, scale (linear, square root,
  logarithmic), font, bold/italic/underline, padding, lower case, shrink to fit.
- **Orientation** — horizontal, vertical, mixed with a share of vertical words, or custom angles.
- **Layout** — shape and its options, jitter %, **seed** (the same seed always draws the same
  cloud), animation.
- **Colors** — palette (32, 17 colour-blind safe), theme colours, single colour with **fx**,
  gradient by size or by Color value, sentiment, neutral value, background.

---

## Keyboard

Tab into the visual, then ← → ↑ ↓ move word to word in order of weight, Home / End jump to the
first and last, Enter or Space selects (Ctrl to add), Esc clears, Shift+F10 opens the context menu.

---

## When something looks wrong

- **Warning icon "some words do not fit"** — enlarge the visual, lower Maximum words or the font
  sizes, or turn on Shrink to fit.
- **"the", "and", "que" in the cloud** — turn off detection and tick the language, or add the words
  to Exclude words.
- **Everything one colour with Sentiment** — the score is summed; choose Average.
- **Only part of the rows in Desktop** — Desktop sends custom visuals the first 30,000 rows;
  the Power BI service sends them all.

---

Free — every feature, no licence, no watermark. Questions:
https://github.com/tinocallarisa-web/word-cloud/discussions · support@tcviz.com

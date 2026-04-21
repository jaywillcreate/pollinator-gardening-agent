#!/usr/bin/env node
// Convert a batch of plant SVGs into watercolor-styled SVGs.
//
// The watercolor effect layers:
//   1. fractal-noise displacement on the source art -> wobbly, hand-painted edges
//   2. a light gaussian blur                        -> soft pigment bleed
//   3. high-frequency noise, tinted warm & faded    -> paper-grain overlay
//   4. multiply blend                               -> grain lives only on painted pixels

const fs = require('fs');
const path = require('path');

const SRC_DIR = '/Users/jasonwilliams/Desktop/Plant SVGs';
// Single source of truth — every demo page and the chat agent read from here.
const ICON_OUT = path.join(__dirname, '..', 'public', 'icons', 'plants', 'watercolor-front');

// One row per plant. `slug` becomes the filename in /icons/plants/watercolor-front/.
// `height` is a suggested visual height (in px) when placed in a 1000x400 elevation
// diagram with ground line at y=350 — taller plants get bigger numbers, groundcover
// stays small. `srcName` overrides the default source filename when the on-disk
// name doesn't match `name` (trailing-space quirks, "Flower" suffix, etc.).
const PLANTS = [
  { name: 'Anise Hyssop',              slug: 'anise-hyssop',        latin: "Agastache foeniculum",   height: 150, bloom: 'Summer' },
  { name: 'Bee Balm',                  slug: 'bee-balm',            latin: "Monarda didyma",         height: 155, bloom: 'Summer' },
  { name: 'Blanket Flower',            slug: 'blanket-flower',      latin: "Gaillardia aristata",    height: 115, bloom: 'Summer', srcName: 'Blanket Flower ' /* file has trailing space */ },
  { name: 'Blazing Star',              slug: 'blazing-star',        latin: "Liatris ligulistylis",   height: 165, bloom: 'Summer' },
  { name: 'Butterfly Milkweed',        slug: 'butterfly-milkweed',  latin: "Asclepias tuberosa",     height: 135, bloom: 'Summer' },
  { name: 'Canada Ginger',             slug: 'canada-ginger',       latin: "Asarum canadense",       height:  70, bloom: 'Spring' },
  { name: 'Columbine',                 slug: 'columbine',           latin: "Aquilegia canadensis",   height: 130, bloom: 'Spring', srcName: 'Columbine Flower' },
  { name: 'Creeping Thyme',            slug: 'creeping-thyme',      latin: "Thymus serpyllum",       height:  55, bloom: 'Summer' },
  { name: 'Erigeron Lynnhaven Carpet', slug: 'erigeron-lynnhaven',  latin: "Erigeron pulchellus",    height:  85, bloom: 'Spring' },
  { name: 'Golden Alexanders',         slug: 'golden-alexanders',   latin: "Zizia aurea",            height: 130, bloom: 'Spring' },
  { name: 'Golden Ragwort',            slug: 'golden-ragwort',      latin: "Packera aurea",          height: 120, bloom: 'Spring' },
  { name: 'Golden Star Sedge',         slug: 'golden-star-sedge',   latin: "Carex rosea",            height: 115, bloom: 'Spring' },
  { name: 'Joe Pye Weed',              slug: 'joe-pye-weed',        latin: "Eutrochium purpureum",   height: 190, bloom: 'Summer' },
  { name: 'Jr. Walker Nepeta',         slug: 'nepeta-jr-walker',    latin: "Nepeta 'Junior Walker'", height: 110, bloom: 'Summer' },
  { name: 'Liatris Purple',            slug: 'liatris-purple',      latin: "Liatris spicata",        height: 170, bloom: 'Summer' },
  { name: 'Liatris White',             slug: 'liatris-white',       latin: "Liatris spicata 'Alba'", height: 170, bloom: 'Summer' },
  { name: 'Long Beaked Sedge',         slug: 'long-beaked-sedge',   latin: "Carex sprengelii",       height: 130, bloom: 'Spring' },
  { name: 'Moss Phlox',                slug: 'moss-phlox',          latin: "Phlox subulata",         height:  80, bloom: 'Spring' },
  { name: 'Orange Coneflower',         slug: 'orange-coneflower',   latin: "Rudbeckia fulgida",      height: 140, bloom: 'Summer' },
  { name: 'Ox Eye Sunflower',          slug: 'ox-eye-sunflower',    latin: "Heliopsis helianthoides",height: 175, bloom: 'Summer' },
  { name: 'Patridgeberry',             slug: 'partridgeberry',      latin: "Mitchella repens",       height:  90, bloom: 'Summer' },
  { name: 'Purple Coneflower',         slug: 'purple-coneflower',   latin: "Echinacea purpurea",     height: 155, bloom: 'Summer' },
  { name: 'Pussytoes',                 slug: 'pussytoes',           latin: "Antennaria plantaginifolia", height: 65, bloom: 'Spring' },
  { name: 'Self Heal Plant',           slug: 'self-heal',           latin: "Prunella vulgaris",      height:  90, bloom: 'Summer' },
  { name: 'Smooth Blue Aster',         slug: 'smooth-blue-aster',   latin: "Symphyotrichum laeve",   height: 155, bloom: 'Fall',   srcName: 'Smooth Blue Aster ' /* file has trailing space */ },
  { name: 'Threadleaf Coreopsis',      slug: 'threadleaf-coreopsis',latin: "Coreopsis verticillata", height: 120, bloom: 'Summer' },
  { name: 'Wild Strawberry',           slug: 'wild-strawberry',     latin: "Fragaria virginiana",    height:  90, bloom: 'Spring' },
  { name: 'Wild Violet',               slug: 'wild-violet',         latin: "Viola sororia",          height:  95, bloom: 'Spring' },
  { name: 'Woodland Stonecrop',        slug: 'woodland-stonecrop',  latin: "Sedum ternatum",         height: 100, bloom: 'Spring' },
  { name: 'Zigzag Goldenrod',          slug: 'zigzag-goldenrod',    latin: "Solidago flexicaulis",   height: 160, bloom: 'Fall'   },
];

const WATERCOLOR_FILTER = `<filter id="watercolor" x="-20%" y="-20%" width="140%" height="140%" color-interpolation-filters="sRGB">
  <feTurbulence type="fractalNoise" baseFrequency="0.018 0.022" numOctaves="3" seed="4" result="edgeNoise"/>
  <feDisplacementMap in="SourceGraphic" in2="edgeNoise" scale="5" xChannelSelector="R" yChannelSelector="G" result="distorted"/>
  <feGaussianBlur in="distorted" stdDeviation="0.9" result="softened"/>
  <feTurbulence type="fractalNoise" baseFrequency="1.4" numOctaves="2" seed="11" result="paper"/>
  <feColorMatrix in="paper" type="matrix" values="0 0 0 0 0.96  0 0 0 0 0.90  0 0 0 0 0.78  0 0 0 0.18 0" result="paperTint"/>
  <feComposite in="paperTint" in2="softened" operator="in" result="grainOnPaint"/>
  <feBlend in="softened" in2="grainOnPaint" mode="multiply" result="painted"/>
  <feColorMatrix in="painted" type="matrix" values="1.08 0 0 0 0  0 1.05 0 0 0  0 0 1.03 0 0  0 0 0 1 0"/>
</filter>`;

function applyWatercolor(svg) {
  // Ensure the root <svg> has explicit width/height attributes. The source
  // files only declare viewBox="0 0 300 300"; without explicit width/height,
  // Chrome/Firefox/Safari disagree on intrinsic size when the file is
  // referenced by an HTML <img> or nested SVG <image>, which can leave the
  // element invisible or collapsed. Add width=height=300.
  //
  // Note: We previously layered a feTurbulence+feDisplacementMap+paper-grain
  // filter on top of the source art. It looked great in Chromium but Safari/
  // WebKit refuses to execute expensive SVG filters when the file is loaded
  // via an HTML <img> tag OR via an SVG <image> href — it just renders the
  // broken-image placeholder. The source illustrations are already full-color
  // watercolor botanicals, so the filter was aesthetic polish, not essential.
  // Ship the plain source so every browser renders the plants correctly.
  let out = svg;
  if (!/<svg[^>]*\bwidth=/.test(out)) {
    out = out.replace(/<svg\b/, '<svg width="300" height="300"');
  }
  return out;
}

fs.mkdirSync(ICON_OUT, { recursive: true });

const manifest = [];
for (const plant of PLANTS) {
  // `srcName` overrides when the on-disk filename differs from `name`
  // (trailing spaces, "Flower" suffix on Columbine, etc.).
  const srcName = plant.srcName ?? plant.name;
  const srcFile = path.join(SRC_DIR, `diagram_${srcName}.svg`);

  const srcSvg = fs.readFileSync(srcFile, 'utf8');
  const outSvg = applyWatercolor(srcSvg);

  fs.writeFileSync(path.join(ICON_OUT, `${plant.slug}.svg`), outSvg);

  manifest.push({
    name: plant.name,
    slug: plant.slug,
    latin: plant.latin,
    height: plant.height,
    bloom: plant.bloom,
    file: `${plant.slug}.svg`,
    bytes: outSvg.length,
  });
  console.log(`${plant.name.padEnd(26)}  ${plant.slug.padEnd(22)}  ${outSvg.length.toString().padStart(7)} bytes`);
}

fs.writeFileSync(path.join(ICON_OUT, 'manifest.json'), JSON.stringify(manifest, null, 2));
console.log(`\nwrote ${manifest.length} watercolor SVGs to ${ICON_OUT}`);

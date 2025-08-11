/*
  Generates two icon assets:
  - assets/securevault-icon-1024.png (gradient background + white shield)
  - assets/securevault-foreground-1024.png (transparent background + white shield)
*/

const fs = require('fs');
const path = require('path');
const sharp = require('sharp');

// Try to load Font Awesome 5 shield-alt, fallback to v6 name if needed
let faIcon;
try {
  // v5 export shape
  // eslint-disable-next-line global-require, import/no-extraneous-dependencies
  const { faShieldAlt } = require('@fortawesome/free-solid-svg-icons');
  faIcon = faShieldAlt;
} catch (_) {
  try {
    // v6 rename
    // eslint-disable-next-line global-require, import/no-extraneous-dependencies
    const { faShieldHalved } = require('@fortawesome/free-solid-svg-icons');
    faIcon = faShieldHalved;
  } catch (err) {
    throw new Error(
      'Could not load Font Awesome shield icon from @fortawesome/free-solid-svg-icons'
    );
  }
}

if (!faIcon || !faIcon.icon) {
  throw new Error('Invalid Font Awesome icon payload');
}

const [faWidth, faHeight, , , svgPathData] = faIcon.icon; // standard FA tuple

const OUTPUT_SIZE = 1024; // px
const SHIELD_SCALE_RATIO = 0.64; // 64% of canvas width

// Attempt to read theme colors from src/contexts/ThemeContext.js (light theme primary/secondary)
function extractThemeColors() {
  try {
    const themePath = path.join(
      process.cwd(),
      'src',
      'contexts',
      'ThemeContext.js'
    );
    const content = fs.readFileSync(themePath, 'utf8');

    // primary line like: primary: isDarkMode ? '#9747ff' : '#8e44ad',
    const primaryMatch = content.match(
      /primary:\s*isDarkMode\s*\?\s*'#[0-9a-fA-F]+'\s*:\s*'(#[0-9a-fA-F]{6})'/
    );
    // secondary line like: secondary: '#3498db',
    const secondaryMatch = content.match(/secondary:\s*'(#[0-9a-fA-F]{6})'/);

    const primary = primaryMatch ? primaryMatch[1] : '#8e44ad';
    const secondary = secondaryMatch ? secondaryMatch[1] : '#3498db';

    return { primary, secondary };
  } catch (e) {
    return { primary: '#8e44ad', secondary: '#3498db' };
  }
}

const { primary, secondary } = extractThemeColors();

function buildShieldSvg({ withBackground }) {
  const targetPathWidth = OUTPUT_SIZE * SHIELD_SCALE_RATIO;
  const scale = targetPathWidth / faWidth;
  const scaledW = faWidth * scale;
  const scaledH = faHeight * scale;
  const offsetX = (OUTPUT_SIZE - scaledW) / 2;
  const offsetY = (OUTPUT_SIZE - scaledH) / 2;

  const bg = withBackground
    ? `<defs>
         <linearGradient id="grad" x1="0" y1="0" x2="0" y2="1">
           <stop offset="0%" stop-color="${primary}"/>
           <stop offset="100%" stop-color="${secondary}"/>
         </linearGradient>
       </defs>
       <rect x="0" y="0" width="${OUTPUT_SIZE}" height="${OUTPUT_SIZE}" fill="url(#grad)"/>`
    : '';

  return `<?xml version="1.0" encoding="UTF-8"?>
<svg width="${OUTPUT_SIZE}" height="${OUTPUT_SIZE}" viewBox="0 0 ${OUTPUT_SIZE} ${OUTPUT_SIZE}" xmlns="http://www.w3.org/2000/svg">
  ${bg}
  <g transform="translate(${offsetX}, ${offsetY}) scale(${scale})">
    <path d="${svgPathData}" fill="#FFFFFF"/>
  </g>
</svg>`;
}

async function generate() {
  const outDir = path.join(process.cwd(), 'assets');
  if (!fs.existsSync(outDir)) fs.mkdirSync(outDir, { recursive: true });

  const iconSvg = buildShieldSvg({ withBackground: true });
  const fgSvg = buildShieldSvg({ withBackground: false });

  const iconPng = await sharp(Buffer.from(iconSvg))
    .png({ quality: 100 })
    .toBuffer();
  const fgPng = await sharp(Buffer.from(fgSvg))
    .png({ quality: 100 })
    .toBuffer();

  const iconPath = path.join(outDir, 'securevault-icon-1024.png');
  const fgPath = path.join(outDir, 'securevault-foreground-1024.png');

  fs.writeFileSync(iconPath, iconPng);
  fs.writeFileSync(fgPath, fgPng);

  // eslint-disable-next-line no-console
  console.log('Generated:', iconPath);
  // eslint-disable-next-line no-console
  console.log('Generated:', fgPath);
}

generate().catch(err => {
  // eslint-disable-next-line no-console
  console.error('Error generating icons:', err);
  process.exit(1);
});

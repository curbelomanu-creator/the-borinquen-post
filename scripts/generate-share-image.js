const fs = require("fs");
const path = require("path");
const sharp = require("sharp");

const INSTAGRAM_BASE_IMAGE = path.join(process.cwd(), "assets", "images", "canva-de-imagenes.jpg");
const WEB_BASE_IMAGE = path.join(process.cwd(), "assets", "images", "canva-web.png");
const OUTPUT_DIR = path.join(process.cwd(), "assets", "images", "generated");

const CATEGORY_DISPLAY_LABELS = {
  economia: "ECONOMÍA",
  empresas: "EMPRESAS",
  gobierno: "GOBIERNO",
  internacional: "INTERNACIONAL",
  mercados: "MERCADOS",
  tribunales: "TRIBUNALES"
};

function escapeXml(text = "") {
  return String(text)
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;")
    .replace(/"/g, "&quot;");
}

function wrapTextByChars(text, maxCharsPerLine = 18) {
  const words = String(text || "").trim().split(/\s+/).filter(Boolean);
  const lines = [];
  let line = "";

  for (const word of words) {
    const testLine = line ? `${line} ${word}` : word;

    if (testLine.length > maxCharsPerLine) {
      if (line) lines.push(line);
      line = word;
    } else {
      line = testLine;
    }
  }

  if (line) lines.push(line);

  return lines;
}

function resolveHeadlineLayout(text, presets) {
  for (const preset of presets) {
    const lines = wrapTextByChars(text, preset.maxCharsPerLine);
    if (lines.length <= preset.maxLines) {
      return {
        ...preset,
        lines
      };
    }
  }

  const fallback = presets[presets.length - 1];
  return {
    ...fallback,
    lines: wrapTextByChars(text, fallback.maxCharsPerLine)
  };
}

function buildOverlaySvg({ width, height, lines, categoryLabel, quoteFontSize, quoteLineHeight, quoteX, quoteY, markX, markY, markSize, categoryX, categoryY, ruleX1, ruleX2, ruleY, categoryLetterSpacing, contentShiftY = 0 }) {
  return `
  <svg width="${width}" height="${height}" viewBox="0 0 ${width} ${height}" xmlns="http://www.w3.org/2000/svg">
    <style>
      .quote {
        font-family: Georgia, 'Times New Roman', serif;
        font-size: ${quoteFontSize}px;
        font-weight: 600;
        letter-spacing: 2px;
        fill: #F7FAFF;
      }

      .quote-accent {
        font-family: Georgia, 'Times New Roman', serif;
        font-size: ${quoteFontSize}px;
        font-weight: 600;
        letter-spacing: 2px;
        fill: #78BDF2;
      }

      .category {
        font-family: Arial, Helvetica, sans-serif;
        font-size: 62px;
        font-weight: 700;
        letter-spacing: ${categoryLetterSpacing}px;
        fill: #78BDF2;
      }

      .line {
        stroke: #78BDF2;
        stroke-width: 6;
        opacity: 0.85;
      }

      .mark {
        font-family: Georgia, 'Times New Roman', serif;
        font-size: ${markSize}px;
        font-weight: 700;
        fill: #78BDF2;
      }
    </style>

    <text x="${markX}" y="${markY + contentShiftY}" class="mark">“</text>

    ${lines.map((line, index) => {
      const y = quoteY + contentShiftY + index * quoteLineHeight;
      const cssClass = index >= lines.length - 1 ? "quote-accent" : "quote";
      return `<text x="${quoteX}" y="${y}" class="${cssClass}">${escapeXml(line)}</text>`;
    }).join("")}

    <line x1="${ruleX1}" y1="${ruleY}" x2="${ruleX2}" y2="${ruleY}" class="line" />

    <text x="${categoryX}" y="${categoryY}" class="category">${escapeXml(categoryLabel)}</text>
  </svg>
  `;
}

async function renderImage({ baseImage, outputPath, width, height, lines, categoryLabel, overlayOptions }) {
  if (!fs.existsSync(baseImage)) {
    throw new Error(`No existe la imagen base: ${baseImage}`);
  }

  const textSvg = buildOverlaySvg({ width, height, lines, categoryLabel, ...overlayOptions });

  await sharp(baseImage)
    .resize(width, height, {
      fit: "cover",
      kernel: sharp.kernel.lanczos3
    })
    .composite([{ input: Buffer.from(textSvg), top: 0, left: 0 }])
    .sharpen({ sigma: 0.8, m1: 0.8, m2: 1.4, x1: 2, y2: 10, y3: 20 })
    .png({ compressionLevel: 9, adaptiveFiltering: false, palette: false })
    .toFile(outputPath);
}

async function generateShareImage({ phrase, category, slug }) {
  if (!phrase || !category || !slug) {
    throw new Error("Faltan datos para generar la imagen: phrase, category o slug.");
  }

  if (!fs.existsSync(OUTPUT_DIR)) {
    fs.mkdirSync(OUTPUT_DIR, { recursive: true });
  }

  const instagramOutputPath = path.join(OUTPUT_DIR, `${slug}.png`);
  const webOutputPath = path.join(OUTPUT_DIR, `${slug}-web.png`);
  const instagramLayout = resolveHeadlineLayout(phrase, [
    { maxCharsPerLine: 20, maxLines: 4, quoteFontSize: 164, quoteLineHeight: 184, contentShiftY: 0 },
    { maxCharsPerLine: 22, maxLines: 4, quoteFontSize: 152, quoteLineHeight: 172, contentShiftY: -24 },
    { maxCharsPerLine: 24, maxLines: 4, quoteFontSize: 140, quoteLineHeight: 160, contentShiftY: -42 },
    { maxCharsPerLine: 26, maxLines: 4, quoteFontSize: 128, quoteLineHeight: 148, contentShiftY: -58 }
  ]);

  const webLayout = resolveHeadlineLayout(phrase, [
    { maxCharsPerLine: 30, maxLines: 3, quoteFontSize: 132, quoteLineHeight: 148, contentShiftY: 0 },
    { maxCharsPerLine: 34, maxLines: 3, quoteFontSize: 122, quoteLineHeight: 138, contentShiftY: -12 },
    { maxCharsPerLine: 38, maxLines: 3, quoteFontSize: 112, quoteLineHeight: 128, contentShiftY: -22 },
    { maxCharsPerLine: 42, maxLines: 4, quoteFontSize: 104, quoteLineHeight: 118, contentShiftY: -30 }
  ]);

  const categoryLabel = CATEGORY_DISPLAY_LABELS[category] || String(category || "").toUpperCase();

  await renderImage({
    baseImage: INSTAGRAM_BASE_IMAGE,
    outputPath: instagramOutputPath,
    width: 2048,
    height: 2048,
    lines: instagramLayout.lines,
    categoryLabel,
    overlayOptions: {
      quoteFontSize: instagramLayout.quoteFontSize,
      quoteLineHeight: instagramLayout.quoteLineHeight,
      quoteX: 260,
      quoteY: 910,
      markX: 230,
      markY: 720,
      markSize: 250,
      categoryX: 260,
      categoryY: 1830,
      ruleX1: 260,
      ruleX2: 780,
      ruleY: 1660,
      categoryLetterSpacing: 18,
      contentShiftY: instagramLayout.contentShiftY
    }
  });

  await renderImage({
    baseImage: WEB_BASE_IMAGE,
    outputPath: webOutputPath,
    width: 2400,
    height: 1260,
    lines: webLayout.lines,
    categoryLabel,
    overlayOptions: {
      quoteFontSize: webLayout.quoteFontSize,
      quoteLineHeight: webLayout.quoteLineHeight,
      quoteX: 200,
      quoteY: 560,
      markX: 170,
      markY: 410,
      markSize: 210,
      categoryX: 210,
      categoryY: 1110,
      ruleX1: 210,
      ruleX2: 860,
      ruleY: 980,
      categoryLetterSpacing: 14,
      contentShiftY: webLayout.contentShiftY
    }
  });

  return {
    instagramImage: `/assets/images/generated/${slug}.png`,
    webImage: `/assets/images/generated/${slug}-web.png`
  };
}

module.exports = { generateShareImage };

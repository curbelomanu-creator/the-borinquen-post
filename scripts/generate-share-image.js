const fs = require("fs");
const path = require("path");
const sharp = require("sharp");

const BASE_IMAGE = path.join(process.cwd(), "assets", "images", "canva-de-imagenes.jpg");
const OUTPUT_DIR = path.join(process.cwd(), "assets", "images", "generated");

function escapeXml(text = "") {
  return String(text)
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;")
    .replace(/"/g, "&quot;");
}

function wrapText(text, maxCharsPerLine = 18, maxLines = 5) {
  const words = String(text || "").trim().split(/\s+/);
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

    if (lines.length === maxLines) break;
  }

  if (line && lines.length < maxLines) lines.push(line);

  return lines.slice(0, maxLines);
}

async function generateShareImage({ phrase, category, slug }) {
  if (!phrase || !category || !slug) {
    throw new Error("Faltan datos para generar la imagen: phrase, category o slug.");
  }

  if (!fs.existsSync(BASE_IMAGE)) {
    throw new Error(`No existe la imagen base: ${BASE_IMAGE}`);
  }

  if (!fs.existsSync(OUTPUT_DIR)) {
    fs.mkdirSync(OUTPUT_DIR, { recursive: true });
  }

  const outputPath = path.join(OUTPUT_DIR, `${slug}.jpg`);
  const lines = wrapText(phrase, 20, 5);

  const textSvg = `
  <svg width="1024" height="1024" xmlns="http://www.w3.org/2000/svg">
    <style>
      .quote {
        font-family: Georgia, 'Times New Roman', serif;
        font-size: 82px;
        font-weight: 600;
        letter-spacing: 1px;
        fill: #F7FAFF;
      }

      .quote-accent {
        font-family: Georgia, 'Times New Roman', serif;
        font-size: 82px;
        font-weight: 600;
        letter-spacing: 1px;
        fill: #78BDF2;
      }

      .category {
        font-family: Arial, Helvetica, sans-serif;
        font-size: 31px;
        font-weight: 700;
        letter-spacing: 9px;
        fill: #78BDF2;
      }

      .line {
        stroke: #78BDF2;
        stroke-width: 3;
        opacity: 0.85;
      }

      .mark {
        font-family: Georgia, 'Times New Roman', serif;
        font-size: 125px;
        font-weight: 700;
        fill: #78BDF2;
      }
    </style>

    <text x="115" y="360" class="mark">“</text>

    ${lines
      .map((line, index) => {
        const y = 455 + index * 92;
        const cssClass = index >= lines.length - 1 ? "quote-accent" : "quote";
        return `<text x="130" y="${y}" class="${cssClass}">${escapeXml(line)}</text>`;
      })
      .join("")}

    <line x1="130" y1="830" x2="390" y2="830" class="line" />

    <text x="130" y="915" class="category">${escapeXml(category.toUpperCase())}</text>
  </svg>
  `;

  await sharp(BASE_IMAGE)
    .resize(1024, 1024)
    .composite([
      {
        input: Buffer.from(textSvg),
        top: 0,
        left: 0
      }
    ])
    .jpeg({ quality: 92 })
    .toFile(outputPath);

  return `/assets/images/generated/${slug}.jpg`;
}

module.exports = { generateShareImage };

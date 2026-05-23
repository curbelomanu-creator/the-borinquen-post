const fs = require("fs");
const path = require("path");
const sharp = require("sharp");

const BASE_IMAGE = path.join(process.cwd(), "assets", "images", "canva-de-imagenes.jpg");
const OUTPUT_DIR = path.join(process.cwd(), "assets", "images", "generated");
const CANVAS_SIZE = 2048;

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
    .replace(/\"/g, "&quot;");
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

  const outputPath = path.join(OUTPUT_DIR, `${slug}.png`);
  const lines = wrapText(phrase, 20, 5);
  const categoryLabel = CATEGORY_DISPLAY_LABELS[category] || String(category || "").toUpperCase();

  const textSvg = `
  <svg width="2048" height="2048" viewBox="0 0 2048 2048" xmlns="http://www.w3.org/2000/svg">
    <style>
      .quote {
        font-family: Georgia, 'Times New Roman', serif;
        font-size: 164px;
        font-weight: 600;
        letter-spacing: 2px;
        fill: #F7FAFF;
      }

      .quote-accent {
        font-family: Georgia, 'Times New Roman', serif;
        font-size: 164px;
        font-weight: 600;
        letter-spacing: 2px;
        fill: #78BDF2;
      }

      .category {
        font-family: Arial, Helvetica, sans-serif;
        font-size: 62px;
        font-weight: 700;
        letter-spacing: 18px;
        fill: #78BDF2;
      }

      .line {
        stroke: #78BDF2;
        stroke-width: 6;
        opacity: 0.85;
      }

      .mark {
        font-family: Georgia, 'Times New Roman', serif;
        font-size: 250px;
        font-weight: 700;
        fill: #78BDF2;
      }
    </style>

    <text x="230" y="720" class="mark">“</text>

    ${lines
      .map((line, index) => {
        const y = 910 + index * 184;
        const cssClass = index >= lines.length - 1 ? "quote-accent" : "quote";
        return `<text x="260" y="${y}" class="${cssClass}">${escapeXml(line)}</text>`;
      })
      .join("")}

    <line x1="260" y1="1660" x2="780" y2="1660" class="line" />

    <text x="260" y="1830" class="category">${escapeXml(categoryLabel)}</text>
  </svg>
  `;

  await sharp(BASE_IMAGE)
    .resize(CANVAS_SIZE, CANVAS_SIZE, {
      fit: "cover",
      kernel: sharp.kernel.lanczos3
    })
    .composite([
      {
        input: Buffer.from(textSvg),
        top: 0,
        left: 0
      }
    ])
    .sharpen({ sigma: 0.8, m1: 0.8, m2: 1.4, x1: 2, y2: 10, y3: 20 })
    .png({ compressionLevel: 9, adaptiveFiltering: false, palette: false })
    .toFile(outputPath);

  return `/assets/images/generated/${slug}.png`;
}

module.exports = { generateShareImage };

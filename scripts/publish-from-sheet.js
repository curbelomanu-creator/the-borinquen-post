#!/usr/bin/env node

const fs = require('fs');
const path = require('path');
const { google } = require('googleapis');
const { generateShareImage } = require('./generate-share-image');

const CATEGORY_MAP = {
  economia: 'economia',
  empresas: 'empresas',
  gobierno: 'gobierno',
  internacional: 'internacional',
  mercados: 'mercados',
  tribunales: 'tribunales'
};

function normalizeText(value) {
  return (value || '')
    .toString()
    .trim()
    .toLowerCase()
    .normalize('NFD')
    .replace(/[\u0300-\u036f]/g, '');
}

function normalizeCategory(categoryRaw) {
  const key = normalizeText(categoryRaw);
  return CATEGORY_MAP[key] || null;
}

function toISODate(value) {
  if (!value) return null;
  const trimmed = value.toString().trim();
  if (!trimmed) return null;

  if (/^\d{4}-\d{2}-\d{2}$/.test(trimmed)) {
    const date = new Date(`${trimmed}T00:00:00Z`);
    if (!Number.isNaN(date.getTime())) return trimmed;
  }

  if (/^\d+$/.test(trimmed)) {
    const serial = Number(trimmed);
    if (!Number.isNaN(serial) && serial > 0) {
      const excelEpoch = new Date(Date.UTC(1899, 11, 30));
      const date = new Date(excelEpoch.getTime() + serial * 86400000);
      if (!Number.isNaN(date.getTime())) {
        return date.toISOString().slice(0, 10);
      }
    }
  }

  const parsed = new Date(trimmed);
  if (!Number.isNaN(parsed.getTime())) {
    return parsed.toISOString().slice(0, 10);
  }

  return null;
}

function getTodayISO() {
  return new Date().toISOString().slice(0, 10);
}

const BYLINE_PREFIX = "Redacción por The Borinquen Post.";

function makeDescription(body) {
  const clean = body.replace(/\s+/g, ' ').trim();
  if (clean.length <= 160) return clean;
  return `${clean.slice(0, 157).trimEnd()}...`;
}

function yamlEscape(value) {
  return String(value || '').replace(/"/g, '\\"');
}

function normalizeBody(bodyRaw) {
  const body = (bodyRaw || '').trim();
  if (!body) return body;

  if (body.startsWith(BYLINE_PREFIX)) {
    const rest = body.slice(BYLINE_PREFIX.length).trimStart();
    const bylineHtml = '<p class="article-byline-note"><em>Redacción por The Borinquen Post.</em></p>';
    return rest ? `${bylineHtml}

${rest}` : bylineHtml;
  }

  return body;
}

function readSiteBaseUrl() {
  const fallbackBaseUrl = 'https://theborinquenpost.com';
  const configPath = path.join(process.cwd(), '_config.yml');

  if (!fs.existsSync(configPath)) return fallbackBaseUrl;

  const raw = fs.readFileSync(configPath, 'utf8');
  const lines = raw.split(/\r?\n/);

  let url = '';
  let baseurl = '';

  for (const line of lines) {
    const match = line.match(/^([a-zA-Z0-9_]+):\s*(.*)$/);
    if (!match) continue;
    const key = match[1];
    const value = match[2].trim().replace(/^['"]|['"]$/g, '');
    if (key === 'url') url = value;
    if (key === 'baseurl') baseurl = value;
  }

  if (url) {
    const normalizedUrl = url.replace(/\/+$/, '');
    const normalizedBase = baseurl ? `/${baseurl.replace(/^\/+|\/+$/g, '')}` : '';
    return `${normalizedUrl}${normalizedBase}`;
  }

  if (baseurl) {
    return `https://curbelomanu-creator.github.io${baseurl.startsWith('/') ? '' : '/'}${baseurl}`;
  }

  return fallbackBaseUrl;
}

function buildPublicImageUrl(baseUrl, slug) {
  const normalizedBase = baseUrl.replace(/\/+$/, '');
  return `${normalizedBase}/assets/images/generated/${slug}.png`;
}


async function main() {
  const sheetId = process.env.GOOGLE_SHEET_ID;
  const sheetName = process.env.GOOGLE_SHEET_NAME || 'Hoja 1';
  const serviceAccountJson = process.env.GOOGLE_SERVICE_ACCOUNT_JSON;

  if (!sheetId) throw new Error('Falta GOOGLE_SHEET_ID');
  if (!serviceAccountJson) throw new Error('Falta GOOGLE_SERVICE_ACCOUNT_JSON');

  const credentials = JSON.parse(serviceAccountJson);
  const auth = new google.auth.GoogleAuth({
    credentials,
    scopes: ['https://www.googleapis.com/auth/spreadsheets']
  });

  const sheets = google.sheets({ version: 'v4', auth });
  const response = await sheets.spreadsheets.values.get({
    spreadsheetId: sheetId,
    range: `${sheetName}!A:K`
  });

  const rows = response.data.values || [];
  const dataRows = rows.slice(1);
  const siteBaseUrl = readSiteBaseUrl();

  const postsDir = path.join(process.cwd(), '_posts');
  if (!fs.existsSync(postsDir)) fs.mkdirSync(postsDir, { recursive: true });

  let createdCount = 0;
  let skippedCount = 0;
  const existingFiles = [];
  const invalidCategories = new Set();

  for (let i = 0; i < dataRows.length; i += 1) {
    const row = dataRows[i];
    const [titleRaw, bodyRaw, categoryRaw, sourceRaw, seoTitleRaw, seoDescriptionRaw, slugRaw, dateRaw, fraseImagenRaw, authorRaw] = row;
    const sheetRowNumber = i + 2;

    const title = (titleRaw || '').trim();
    const body = normalizeBody(bodyRaw);
    const slug = (slugRaw || '').trim();

    if (!title || !body || !categoryRaw || !slug) {
      skippedCount += 1;
      console.warn(`⚠️ Fila ${i + 2} omitida por campos requeridos faltantes.`);
      continue;
    }

    const normalizedCategory = normalizeCategory(categoryRaw);
    if (!normalizedCategory) {
      skippedCount += 1;
      invalidCategories.add((categoryRaw || '').trim());
      console.warn(`⚠️ Fila ${i + 2} omitida por categoría inválida: "${categoryRaw}".`);
      continue;
    }

    const date = toISODate(dateRaw) || getTodayISO();
    const filename = `${date}-${slug}.md`;
    const filepath = path.join(postsDir, filename);

    if (fs.existsSync(filepath)) {
      skippedCount += 1;
      existingFiles.push(filename);
      continue;
    }

    const seoTitle = (seoTitleRaw || '').trim() || title;
    const description = (seoDescriptionRaw || '').trim() || makeDescription(body);
    const author = (authorRaw || '').trim() || 'The Borinquen Post';
    const source = (sourceRaw || '').trim();
    const fraseImagen = (fraseImagenRaw || '').trim() || title;

    const fallbackImage = '/assets/images/default.jpg';
    let instagramImage = fallbackImage;
    let webImage = fallbackImage;
    let imageGenerated = false;
    try {
      const generatedImages = await generateShareImage({
        phrase: fraseImagen,
        category: normalizedCategory,
        slug
      });
      instagramImage = generatedImages.instagramImage || fallbackImage;
      webImage = generatedImages.webImage || fallbackImage;
      imageGenerated = true;
    } catch (error) {
      console.warn(`⚠️ No se pudo generar imagen para ${slug}: ${error.message}`);
    }

    const lines = [
      '---',
      'layout: post',
      `title: "${yamlEscape(title)}"`,
      `seo_title: "${yamlEscape(seoTitle)}"`,
      `description: "${yamlEscape(description)}"`,
      `date: "${date}"`,
      `author: "${yamlEscape(author)}"`,
      `category: "${normalizedCategory}"`,
      `categories: ["${normalizedCategory}"]`,
      `image: "${yamlEscape(webImage)}"`,
      `web_image: "${yamlEscape(webImage)}"`,
      `instagram_image: "${yamlEscape(instagramImage)}"`,
      `featured_image: "${yamlEscape(webImage)}"`,
      `thumbnail: "${yamlEscape(webImage)}"`,
      `cover: "${yamlEscape(webImage)}"`,
      `og_image: "${yamlEscape(instagramImage)}"`,
      `twitter:image: "${yamlEscape(instagramImage)}"`,
      `sources: "${yamlEscape(source)}"`,
      `slug: "${yamlEscape(slug)}"`,
      '---',
      '',
      body,
      ''
    ];

    fs.writeFileSync(filepath, lines.join('\n'));
    createdCount += 1;
    console.log(`✅ Creado: _posts/${filename}`);

    if (imageGenerated) {
      const imagePublicUrl = buildPublicImageUrl(siteBaseUrl, slug);
      await sheets.spreadsheets.values.update({
        spreadsheetId: sheetId,
        range: `${sheetName}!K${sheetRowNumber}`,
        valueInputOption: 'RAW',
        requestBody: {
          values: [[imagePublicUrl]]
        }
      });
      console.log(`📝 Imagen publicada registrada en ${sheetName}!K${sheetRowNumber}`);
    }
  }

  console.log('');
  console.log('===== Resumen de publicación =====');
  console.log(`Filas leídas: ${dataRows.length}`);
  console.log(`Posts creados: ${createdCount}`);
  console.log(`Filas omitidas: ${skippedCount}`);
  console.log(`Archivos ya existentes: ${existingFiles.length}`);
  if (existingFiles.length > 0) {
    existingFiles.forEach((file) => console.log(`- ${file}`));
  }
  console.log(`Categorías inválidas encontradas: ${invalidCategories.size}`);
  if (invalidCategories.size > 0) {
    Array.from(invalidCategories).forEach((cat) => console.log(`- ${cat}`));
  }

  process.exitCode = 0;
}

main().catch((error) => {
  console.error('❌ Error en publish-from-sheet:', error.message);
  process.exit(1);
});

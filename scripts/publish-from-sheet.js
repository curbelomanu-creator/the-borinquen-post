#!/usr/bin/env node

const fs = require('fs');
const path = require('path');
const { google } = require('googleapis');

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
const VALID_IMAGE_URL = /^https?:\/\//i;

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

function normalizeImage(imageRaw) {
  const image = (imageRaw || '').trim();
  return VALID_IMAGE_URL.test(image) ? image : '';
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
    scopes: ['https://www.googleapis.com/auth/spreadsheets.readonly']
  });

  const sheets = google.sheets({ version: 'v4', auth });
  const response = await sheets.spreadsheets.values.get({
    spreadsheetId: sheetId,
    range: `${sheetName}!A:J`
  });

  const rows = response.data.values || [];
  const dataRows = rows.slice(1);

  const postsDir = path.join(process.cwd(), '_posts');
  if (!fs.existsSync(postsDir)) fs.mkdirSync(postsDir, { recursive: true });

  let createdCount = 0;
  let skippedCount = 0;
  const existingFiles = [];
  const invalidCategories = new Set();

  for (let i = 0; i < dataRows.length; i += 1) {
    const row = dataRows[i];
    const [titleRaw, bodyRaw, categoryRaw, sourceRaw, seoTitleRaw, seoDescriptionRaw, slugRaw, dateRaw, imageRaw, authorRaw] = row;

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
    const image = normalizeImage(imageRaw);

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
      ...(image ? [`image: "${yamlEscape(image)}"`] : []),
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

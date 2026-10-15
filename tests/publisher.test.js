const test = require('node:test');
const assert = require('node:assert/strict');
const { normalizeCategory, parsePublishAt, isPublicationTooOld, isValidSlug } = require('../scripts/publish-from-sheet');

test('admite categorías originales y las que ya se usan en Google Sheets', () => {
  const examples = {
    Economía: 'economia', Gobierno: 'gobierno', Tribunales: 'tribunales',
    Empresas: 'empresas', Internacional: 'internacional', Seguridad: 'seguridad',
    'Puerto Rico': 'puerto-rico', Deportes: 'deportes', 'El Tiempo': 'el-tiempo',
    Entretenimiento: 'entretenimiento', Salud: 'salud', Cultura: 'cultura',
    Política: 'politica', Ambiente: 'ambiente', Energía: 'energia',
    Turismo: 'turismo', Educación: 'educacion', Locales: 'locales',
    Clima: 'clima', 'Ciencia y Tecnología': 'ciencia-y-tecnologia',
    Ciencia: 'ciencia', Empleo: 'empleo'
  };
  for (const [label, expected] of Object.entries(examples)) {
    assert.equal(normalizeCategory(label), expected, label);
  }
});

test('rechaza categorías vacías o contenido de una columna desplazada', () => {
  assert.equal(normalizeCategory(''), null);
  assert.equal(normalizeCategory('Este texto es el cuerpo de un artículo en vez de una categoría'), null);
});

test('omite noticias antiguas sin bloquear las nuevas o futuras', () => {
  const now = new Date('2026-10-15T21:00:00Z').getTime();
  assert.equal(isPublicationTooOld(parsePublishAt('2026-10-06 12:00'),'2026-10-06',now,3),true);
  assert.equal(isPublicationTooOld(parsePublishAt('2026-10-15 17:30'),'2026-10-15',now,3),false);
  assert.equal(isPublicationTooOld(null,'2026-10-14',now,3),false);
});

test('solo permite slugs de noticias válidos y evita textos desplazados', () => {
  assert.equal(isValidSlug('noticia-legitima-puerto-rico-2026'), true);
  assert.equal(isValidSlug('El Nuevo Día'), false);
  assert.equal(isValidSlug('Una noticia completa en otra columna.'), false);
  assert.equal(isValidSlug(''), false);
});

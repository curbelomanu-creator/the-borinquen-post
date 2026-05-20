# The Borinquen Post (Jekyll)

Sitio de noticias en Jekyll para GitHub Pages.

## Estructura

- `_config.yml`: configuración principal del sitio.
- `_layouts/default.html`: layout base compartido por todas las páginas.
- `_layouts/post.html`: layout para artículos/noticias.
- `_includes/header.html` y `_includes/nav.html`: componentes reutilizables del encabezado y menú.
- `_posts/`: artículos en formato Markdown con front matter.
- `assets/css/main.css`: estilos editoriales (blanco + azul marino).

## Cómo crear nuevos artículos

1. Crear un archivo en `_posts/` con formato `YYYY-MM-DD-titulo.md`.
2. Añadir front matter mínimo:

```yaml
---
layout: post
title: "Título del artículo"
category: "Economía"
category_slug: "economia"
author: "Redacción TBP"
image: "https://..."
excerpt: "Resumen corto para tarjetas"
---
```

3. Escribir el contenido en Markdown debajo del front matter.
4. El artículo aparecerá automáticamente en la portada y en su sección (si `category_slug` coincide con la sección).

## Desarrollo local

```bash
bundle exec jekyll serve
```

## Nota

Todos los links de navegación y CSS usan `relative_url` para compatibilidad con GitHub Pages.


### Configuración para GitHub Pages de repositorio

Este sitio usa `baseurl: "/the-borinquen-post"` en `_config.yml` para que CSS y enlaces funcionen cuando se publica como **Project Pages**.

Si luego lo publicas en un dominio raíz (User/Org Pages o dominio personalizado), cambia `baseurl` a `""`.


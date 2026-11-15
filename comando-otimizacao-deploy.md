# COMANDO — OTIMIZAÇÃO + DEPLOY DO TORCIDA.

Aplicado no stack Hostinger estático (`sistema/public` + PHP), sem Vite/`dist/`.

## Feito
- `/` = portal (Hoje) via `sistema/public/index.html` + `.htaccess`
- `/portal.html` redireciona para `/`
- Fundo estático + Ken Burns 1→1.08 / 40s
- Archivo self-host (`/fonts` + `/css/fonts.css`), sem Google Fonts CDN
- GSAP/Lenis locais (sem CDN)
- Escudos com fallback monograma; notícias sem CAPA fake
- Sino restaurado (sem badge fake; vazio até haver evento)
- PWA: `manifest.json` + `favicon.png`
- Skeleton/erro de notícias já existiam no feed

## Build
Este repo **não usa** `npm run build` / Vite. O “deployável” é `sistema/public` (~1.4 MB).

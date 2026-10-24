#!/bin/sh
# © 2026 KoreStock Ledger — un proyecto de Kitsótaro · Código disponible, todos los derechos reservados (ver LICENSE).
# Herramienta de despliegue (Cloudflare Pages: «Build command» = sh herramientas/publicar.sh,
# «Build output directory» = publico). Copia solo lo que usa la app: deja fuera las
# pruebas, estas herramientas, las fuentes de los íconos (la app usa assets/iconos.svg),
# los textos del repo y, por si acaso, todo lo privado. La app no se compila.
set -e
rm -rf publico
mkdir publico
tar --exclude=./publico --exclude=./.git --exclude=./pruebas --exclude=./herramientas \
    --exclude=./_privado --exclude=./CLAUDE.md --exclude=./CLAUDE.local.md --exclude=./.claude --exclude='*.xlsx' \
    --exclude=./assets/iconos --exclude=./README.md --exclude=./CHANGELOG.md --exclude=./.gitignore \
    -cf - . | (cd publico && tar -xf -)
echo "Listo: $(find publico -type f | wc -l) archivos en publico/"

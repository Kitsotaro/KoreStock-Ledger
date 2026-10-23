# © 2026 Wilber Adonay Escobar Solórzano (Kitsótaro) · KoreStock Ledger · Código disponible, todos los derechos reservados (ver LICENSE).
# Herramienta de desarrollo (la app no la usa): arma assets/iconos.svg, un sprite con
# todos los íconos como <symbol id="i-NOMBRE">. Los íconos base vienen del set de Zeghi
# (assets/iconos/*.svg); los propios de KoreStock están en herramientas/iconos-nuevos.json.
# Uso:  python herramientas/generar-sprite.py
import json, os, re

RAIZ = os.path.dirname(os.path.dirname(os.path.abspath(__file__)))
CARPETA = os.path.join(RAIZ, 'assets', 'iconos')
ATRIBUTOS = 'xmlns="http://www.w3.org/2000/svg" viewBox="0 0 24 24" width="24" height="24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"'

nuevos = json.load(open(os.path.join(RAIZ, 'herramientas', 'iconos-nuevos.json'), encoding='utf-8'))
for nombre, cuerpo in nuevos.items():
    if nombre.startswith('_'):
        continue
    with open(os.path.join(CARPETA, nombre + '.svg'), 'w', encoding='utf-8') as f:
        f.write(f'<svg {ATRIBUTOS}>{cuerpo}</svg>\n')

simbolos = []
for archivo in sorted(os.listdir(CARPETA)):
    if not archivo.endswith('.svg'):
        continue
    nombre = archivo[:-4]
    svg = open(os.path.join(CARPETA, archivo), encoding='utf-8').read()
    interior = re.search(r'<svg[^>]*>(.*)</svg>', svg, re.S).group(1).strip()
    interior = interior.replace('"', "'")
    simbolos.append(f'<symbol id="i-{nombre}" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round">{interior}</symbol>')

salida = ('<svg xmlns="http://www.w3.org/2000/svg">'
          + ''.join(simbolos) + '</svg>\n')
open(os.path.join(RAIZ, 'assets', 'iconos.svg'), 'w', encoding='utf-8').write(salida)
print(len(simbolos), 'íconos en assets/iconos.svg')

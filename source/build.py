#!/usr/bin/env python3
"""Assemble the dependency-free distributable; Python 3 standard library only."""
from pathlib import Path
root = Path(__file__).resolve().parent
html = (root/'src/shell.html').read_text()
for token, name in [('STYLE','style.css'),('DATA','data.js'),('CORE','core.js'),('APP','app.js')]:
    content = (root/'src'/name).read_text()
    if token != 'STYLE' and '</script' in content.lower():
        raise ValueError(f'Unsafe inline script terminator in {name}')
    html = html.replace('/*'+token+'*/',content)
(root/'index.html').write_text(html,encoding='utf-8')
print(f'Built index.html ({len(html.encode()):,} bytes)')

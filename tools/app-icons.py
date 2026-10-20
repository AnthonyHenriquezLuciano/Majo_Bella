"""MAJOBELLA · Íconos de las apps a partir del monograma de la web (assets/monograma.png)
Uso: python3 tools/app-icons.py   → apps/cliente/assets/images y apps/estudio/assets/images
App de clientas: fondo negro, monograma blanco (igual que el ícono de la web).
App del estudio: fondo blanco, monograma negro."""
from PIL import Image, ImageOps
import os

ROOT = os.path.dirname(os.path.dirname(os.path.abspath(__file__)))
mono = Image.open(os.path.join(ROOT, 'assets/monograma.png')).convert('RGBA')
logo = Image.open(os.path.join(ROOT, 'assets/logo-majobella.png')).convert('RGBA')

def tint(im, rgb):
    a = im.split()[3]
    out = Image.new('RGBA', im.size, rgb + (0,))
    out.putalpha(a)
    return out

def place(canvas, im, scale):
    W, H = canvas.size
    w = int(W * scale); h = int(im.height * w / im.width)
    im2 = im.resize((w, h), Image.LANCZOS)
    canvas.alpha_composite(im2, ((W - w) // 2, (H - h) // 2))
    return canvas

def build(app, bg, fg):
    d = os.path.join(ROOT, 'apps', app, 'assets', 'images')
    os.makedirs(d, exist_ok=True)
    m = tint(mono, fg)
    place(Image.new('RGBA', (1024, 1024), bg + (255,)), m, 0.58).convert('RGB').save(os.path.join(d, 'icon.png'))
    # Android adaptativo: el sistema recorta al centro (zona segura ≈ 66 %)
    place(Image.new('RGBA', (1024, 1024), (0, 0, 0, 0)), m, 0.42).save(os.path.join(d, 'android-icon-foreground.png'))
    Image.new('RGB', (1024, 1024), bg).save(os.path.join(d, 'android-icon-background.png'))
    place(Image.new('RGBA', (1024, 1024), (0, 0, 0, 0)), tint(mono, (0, 0, 0)), 0.42).save(os.path.join(d, 'android-icon-monochrome.png'))
    # Pantalla de inicio: logo completo en negro sobre blanco
    place(Image.new('RGBA', (1200, 600), (0, 0, 0, 0)), tint(logo, (17, 17, 17)), 0.9).save(os.path.join(d, 'splash-icon.png'))
    place(Image.new('RGBA', (48, 48), bg + (255,)), m, 0.7).save(os.path.join(d, 'favicon.png'))
    # Logo y monograma para dentro de la app
    tint(logo, (17, 17, 17)).save(os.path.join(d, 'logo.png'))
    tint(mono, (17, 17, 17)).save(os.path.join(d, 'monograma.png'))
    tint(mono, (255, 255, 255)).save(os.path.join(d, 'monograma-blanco.png'))

build('cliente', (17, 17, 17), (255, 255, 255))
build('estudio', (255, 255, 255), (17, 17, 17))
print('Íconos listos')

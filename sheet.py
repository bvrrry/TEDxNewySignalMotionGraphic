import sys, glob
from PIL import Image, ImageDraw
files = sorted(glob.glob(sys.argv[1] + '/t_*.png'), key=lambda f: float(f.split('t_')[1][:-4]))
cols = int(sys.argv[3]) if len(sys.argv) > 3 else 3; w, h = 640, 360
rows = (len(files) + cols - 1) // cols
S = Image.new('RGB', (cols * w, rows * h))
for i, f in enumerate(files):
    im = Image.open(f).convert('RGB').resize((w, h))
    d = ImageDraw.Draw(im); d.text((8, 6), f.split('t_')[1][:-4], fill=(0, 255, 0))
    S.paste(im, ((i % cols) * w, (i // cols) * h))
S.save(sys.argv[2])

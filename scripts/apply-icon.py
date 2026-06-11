"""
Applies the user-designed WordFlip icon (assets/icon-concepts/wordflip_icon.png)
across all the places Expo expects an app icon:

  - assets/icon.png                    (iOS / web / general)
  - assets/favicon.png                 (web tab favicon)
  - assets/android-icon-foreground.png (Android adaptive icon, safe-zone padded)
  - assets/android-icon-background.png (Android adaptive icon background fill)
  - assets/android-icon-monochrome.png (Android 13+ themed icon silhouette)

Run with: python scripts/apply-icon.py
"""

import os
from PIL import Image

ASSETS = os.path.join(os.path.dirname(__file__), "..", "assets")
SRC = os.path.join(ASSETS, "icon-concepts", "wordflip_icon.png")

BG = (15, 15, 17)  # #0f0f11 — app's dark theme background (src/theme/colors.ts)

src = Image.open(SRC).convert("RGBA")
w, h = src.size

# 1. Main app icon — flatten transparent corners onto the app's bg color
flat = Image.new("RGB", (w, h), BG)
flat.paste(src, (0, 0), src)
flat.save(os.path.join(ASSETS, "icon.png"))

# 2. Favicon — keep transparency / rounded corners for browser tabs
favicon = src.resize((256, 256), Image.LANCZOS)
favicon.save(os.path.join(ASSETS, "favicon.png"))

# 3. Android adaptive icon foreground — scale to 70% and center, so the
#    design stays inside the safe zone regardless of launcher mask shape
fg = Image.new("RGB", (w, h), BG)
scaled = flat.resize((int(w * 0.7), int(h * 0.7)), Image.LANCZOS)
offset = ((w - scaled.width) // 2, (h - scaled.height) // 2)
fg.paste(scaled, offset)
fg.save(os.path.join(ASSETS, "android-icon-foreground.png"))

# 4. Android adaptive icon background — solid fill matching the app theme
bg_img = Image.new("RGB", (w, h), BG)
bg_img.save(os.path.join(ASSETS, "android-icon-background.png"))

# 5. Android 13+ monochrome (themed) icon — white silhouette by luminance
gray = fg.convert("L")
alpha = gray.point(lambda p: max(0, min(255, int((p - 34) * 1.214))))
mono = Image.new("RGBA", (w, h), (255, 255, 255, 255))
mono.putalpha(alpha)
mono.save(os.path.join(ASSETS, "android-icon-monochrome.png"))

print("Done — updated icon.png, favicon.png, and android-icon-* assets")

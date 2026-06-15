from PIL import Image

# Open the original image
img = Image.open('/Users/siddhantmanglam/Documents/Diet2Fit/frontend/img/logo.png')

# The original image is 1024x1024.
# The icon is centered. The text starts around y=700.
# Let's crop a square from the top: (x=162, y=162) to (x=862, y=862) is 700x700, but text might be in there.
# Let's crop from x=200, y=200, w=624, h=624. Text is probably below y=650.
# Let's do left=212, upper=200, right=812, lower=800
cropped = img.crop((212, 180, 812, 680))

# To make it a square, we can pad it or just crop a 500x500
# Wait, 812-212 = 600, 680-180 = 500. Not square.
# Let's just crop 262, 162, 762, 662 (500x500)
cropped = img.crop((262, 162, 762, 662))
cropped.save('/Users/siddhantmanglam/Documents/Diet2Fit/frontend/img/logo.png')
print("Cropped successfully")

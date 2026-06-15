import re

with open('frontend/index.html', 'r', encoding='utf-8') as f:
    content = f.read()

# Add desktop-only and mobile-only classes
css_classes = """
    /* Mobile/Desktop Visibility Utility Classes */
    .desktop-only { display: block !important; }
    .mobile-only { display: none !important; }
    
    @media (max-width: 968px) {
      .desktop-only { display: none !important; }
      .mobile-only { display: block !important; }
      
      /* Also, make sure mobile title is centered if needed */
      .hero-content .mobile-only.hero-title {
        margin-top: 20px;
        margin-bottom: 24px;
      }
      .hero-content .mobile-only .hero-image-wrapper {
        margin-bottom: 24px;
      }
    }
"""
if '.desktop-only' not in content:
    content = content.replace('</style>', css_classes + '\n  </style>')

# Extract the existing elements
title_regex = r'<h1 class="hero-title"[^>]*>Meet the Dietitian Who <br class="hidden sm:block" /><span class="highlight">Won’t Put You on a Diet\.</span></h1>'
label_regex = r'<div class="text-label mb-md"[^>]*>M\.Sc\. Clinical Dietetics \(spec\. Cardiac & Diabetes\)</div>'
visual_regex = r'<div class="hero-visual animate-fade-up"[^>]*>[\s\S]*?<!-- Experience badge -->[\s\S]*?</div>\s*</div>\s*</div>'

title_match = re.search(title_regex, content)
label_match = re.search(label_regex, content)
visual_match = re.search(visual_regex, content)

if title_match and label_match and visual_match:
    title_html = title_match.group(0)
    label_html = label_match.group(0)
    visual_html = visual_match.group(0)
    
    # 1. Update the original Left side block (Desktop version)
    # We will wrap the label and title in desktop-only
    # Wait, the prompt says mobile should be: Title, Image, Label, Text.
    # We can just put a mobile-only Title and Image at the very top of the Left side block!
    
    # Create mobile elements
    mobile_title = title_html.replace('class="hero-title"', 'class="hero-title mobile-only"')
    mobile_visual = visual_html.replace('class="hero-visual animate-fade-up"', 'class="hero-visual animate-fade-up mobile-only"')
    
    # Wrap desktop elements
    desktop_title = title_html.replace('class="hero-title"', 'class="hero-title desktop-only"')
    desktop_label = label_html.replace('class="text-label', 'class="text-label desktop-only')
    mobile_label = label_html.replace('class="text-label', 'class="text-label mobile-only')
    desktop_visual = visual_html.replace('class="hero-visual animate-fade-up"', 'class="hero-visual animate-fade-up desktop-only"')
    
    # Let's rebuild the Left side block
    # Originally: Label -> Title -> Text
    # We want: Mobile Title -> Mobile Image -> Mobile Label -> Desktop Label -> Desktop Title -> Text
    
    # Find the block where Label and Title are.
    left_block_pattern = label_html + r'\s*' + title_html
    
    new_left_block = f"""
          {mobile_title}
          {mobile_visual}
          {mobile_label}
          {desktop_label}
          {desktop_title}
"""
    content = content.replace(left_block_pattern, new_left_block)
    
    # Replace the right side visual with desktop only
    content = content.replace(visual_html, desktop_visual)
    
    with open('frontend/index.html', 'w', encoding='utf-8') as f:
        f.write(content)
    print("Hero section mobile order updated successfully.")
else:
    print("Could not find the elements to replace.")

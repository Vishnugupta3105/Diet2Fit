import os
import re

# 1. Update tagline in index.html
index_path = 'frontend/index.html'
with open(index_path, 'r', encoding='utf-8') as f:
    content = f.read()

# Add tagline to Hero section (replacing the My Philosophy quote)
old_philosophy = '"Food is not the enemy. Confusion is. Remove the confusion and your body will do the rest — it was designed to heal."'
new_tagline = '"Because real health was never about a number."'
content = content.replace(old_philosophy, new_tagline)

# Add logo to navbar in frontend
content = content.replace(
    '''<a href="/" class="navbar-brand">Beyond Kilo's</a>''',
    '''<a href="/" class="navbar-brand" style="display:flex; align-items:center; gap:8px;">
        <img src="img/logo.png" alt="Beyond Kilo's Logo" style="height:32px; border-radius:50%;">
        Beyond Kilo's
      </a>'''
)
with open(index_path, 'w', encoding='utf-8') as f:
    f.write(content)


# 2. Add logo to all client-portal and admin-panel files
for portal_dir in ['client-portal', 'admin-panel']:
    for filename in os.listdir(portal_dir):
        if filename.endswith('.html'):
            filepath = os.path.join(portal_dir, filename)
            with open(filepath, 'r', encoding='utf-8') as f:
                content = f.read()
                
            # Replace mobile header
            content = content.replace(
                '''<span style="font-family:'Playfair Display',serif;font-size:1.2rem;font-weight:700;color:var(--primary);">Beyond Kilo's</span>''',
                '''<span style="display:flex; align-items:center; gap:8px; font-family:'Playfair Display',serif;font-size:1.2rem;font-weight:700;color:var(--primary);">
          <img src="/img/logo.png" alt="Logo" style="height:28px; border-radius:50%;"> Beyond Kilo's
        </span>'''
            )
            
            # Replace sidebar
            content = content.replace(
                '''<div class="sidebar-brand">Beyond Kilo's</div>''',
                '''<div class="sidebar-brand" style="display:flex; align-items:center; gap:8px;">
        <img src="/img/logo.png" alt="Logo" style="height:32px; border-radius:50%;"> Beyond Kilo's
      </div>'''
            )
            
            with open(filepath, 'w', encoding='utf-8') as f:
                f.write(content)

print("Logos and tagline updated.")

import os

# New unified styles
new_nav = '''<a href="/" class="navbar-brand" style="display:flex; align-items:center; gap:12px; text-decoration:none;">
        <div style="width:48px; height:48px; border-radius:50%; background:#fff; display:flex; align-items:center; justify-content:center; box-shadow:0 4px 12px rgba(0,0,0,0.08); overflow:hidden; flex-shrink:0;">
          <img src="img/logo.png" alt="Beyond Kilo's Logo" style="height:100%; width:100%; object-fit:cover;">
        </div>
        <div style="display:flex; flex-direction:column; line-height:1;">
          <span style="font-family:'Playfair Display',serif; font-size:1.8rem; font-weight:800; color:var(--primary); letter-spacing:-0.5px;">Beyond Kilo's</span>
          <span style="font-size:0.65rem; font-weight:600; text-transform:uppercase; letter-spacing:1.5px; color:var(--text-secondary); margin-top:4px;">Because real health was never about a number.</span>
        </div>
      </a>'''

new_mobile = '''<span style="display:flex; align-items:center; gap:10px; text-decoration:none;">
          <div style="width:40px; height:40px; border-radius:50%; background:#fff; display:flex; align-items:center; justify-content:center; box-shadow:0 4px 10px rgba(0,0,0,0.05); overflow:hidden; flex-shrink:0;">
            <img src="/img/logo.png" alt="Logo" style="height:100%; width:100%; object-fit:cover;">
          </div>
          <div style="display:flex; flex-direction:column; line-height:1;">
            <span style="font-family:'Playfair Display',serif; font-size:1.4rem; font-weight:800; color:var(--primary); letter-spacing:-0.5px;">Beyond Kilo's</span>
            <span style="font-size:0.55rem; font-weight:600; text-transform:uppercase; letter-spacing:1px; color:var(--text-secondary); margin-top:4px;">Because real health was never about a number.</span>
          </div>
        </span>'''

new_sidebar = '''<div class="sidebar-brand" style="display:flex; align-items:center; gap:12px; padding-bottom: 24px;">
        <div style="width:52px; height:52px; border-radius:50%; background:#fff; display:flex; align-items:center; justify-content:center; box-shadow:0 6px 16px rgba(0,0,0,0.08); overflow:hidden; flex-shrink:0;">
          <img src="/img/logo.png" alt="Logo" style="height:100%; width:100%; object-fit:cover;">
        </div>
        <div style="display:flex; flex-direction:column; line-height:1; text-align:left;">
          <span style="font-family:'Playfair Display',serif; font-size:1.6rem; font-weight:800; color:var(--primary); letter-spacing:-0.5px;">Beyond Kilo's</span>
          <span style="font-size:0.6rem; font-weight:600; text-transform:uppercase; letter-spacing:1px; color:var(--text-secondary); margin-top:6px;">Because real health was never about a number.</span>
        </div>
      </div>'''


# 1. Update book.html, index.html, login.html
old_nav_regex = r'<a href="/" class="navbar-brand" style="display:flex; align-items:center; gap:8px; text-decoration:none;">\s*<img src="img/logo.png" alt="Beyond Kilo\'s Logo" style="height:36px; border-radius:50%;">\s*<div style="display:flex; flex-direction:column; line-height:1.1;">\s*<span style="font-family:\'Playfair Display\',serif; font-size:1.5rem; font-weight:700; color:var\(--primary\);">Beyond Kilo\'s</span>\s*<span style="font-size:0.55rem; font-weight:600; text-transform:uppercase; letter-spacing:0.5px; color:var\(--text-secondary\);">Because real health was never about a number.</span>\s*</div>\s*</a>'
import re

for file in ['frontend/index.html', 'frontend/book.html', 'frontend/login.html']:
    with open(file, 'r', encoding='utf-8') as f:
        content = f.read()
    content = re.sub(old_nav_regex, new_nav, content, flags=re.MULTILINE)
    with open(file, 'w', encoding='utf-8') as f:
        f.write(content)

# 2. Update client-portal and admin-panel files
old_mobile_regex = r'<span style="display:flex; align-items:center; gap:8px; text-decoration:none;">\s*<img src="/img/logo.png" alt="Logo" style="height:32px; border-radius:50%;">\s*<div style="display:flex; flex-direction:column; line-height:1.1;">\s*<span style="font-family:\'Playfair Display\',serif; font-size:1.2rem; font-weight:700; color:var\(--primary\);">Beyond Kilo\'s</span>\s*<span style="font-size:0.5rem; font-weight:600; text-transform:uppercase; letter-spacing:0.5px; color:var\(--text-secondary\);">Because real health was never about a number.</span>\s*</div>\s*</span>'

old_sidebar_regex = r'<div class="sidebar-brand" style="display:flex; align-items:center; gap:8px; padding-bottom: 20px;">\s*<img src="/img/logo.png" alt="Logo" style="height:40px; border-radius:50%;">\s*<div style="display:flex; flex-direction:column; line-height:1.1; text-align:left;">\s*<span style="font-family:\'Playfair Display\',serif; font-size:1.4rem; font-weight:700; color:var\(--primary\);">Beyond Kilo\'s</span>\s*<span style="font-size:0.55rem; font-weight:600; text-transform:uppercase; letter-spacing:0.5px; color:var\(--text-secondary\);">Because real health was never about a number.</span>\s*</div>\s*</div>'

for portal_dir in ['client-portal', 'admin-panel']:
    for filename in os.listdir(portal_dir):
        if filename.endswith('.html'):
            filepath = os.path.join(portal_dir, filename)
            with open(filepath, 'r', encoding='utf-8') as f:
                content = f.read()
                
            content = re.sub(old_mobile_regex, new_mobile, content, flags=re.MULTILINE)
            content = re.sub(old_sidebar_regex, new_sidebar, content, flags=re.MULTILINE)
            
            with open(filepath, 'w', encoding='utf-8') as f:
                f.write(content)

print("Styling updated.")

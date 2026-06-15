import os

# 1. Update book.html and login.html
for file in ['frontend/book.html', 'frontend/login.html']:
    with open(file, 'r', encoding='utf-8') as f:
        content = f.read()
    
    # Check if the old navbar brand is still there or if my first script replaced it
    old_nav1 = '''<a href="/" class="navbar-brand">Beyond Kilo's</a>'''
    old_nav2 = '''<a href="/" class="navbar-brand" style="font-family:'Playfair Display',serif;font-size:1.5rem;font-weight:700;color:var(--primary);">Beyond Kilo's</a>'''
    
    new_nav = '''<a href="/" class="navbar-brand" style="display:flex; align-items:center; gap:8px; text-decoration:none;">
        <img src="img/logo.png" alt="Beyond Kilo's Logo" style="height:36px; border-radius:50%;">
        <div style="display:flex; flex-direction:column; line-height:1.1;">
          <span style="font-family:'Playfair Display',serif; font-size:1.5rem; font-weight:700; color:var(--primary);">Beyond Kilo's</span>
          <span style="font-size:0.55rem; font-weight:600; text-transform:uppercase; letter-spacing:0.5px; color:var(--text-secondary);">Because real health was never about a number.</span>
        </div>
      </a>'''
      
    content = content.replace(old_nav1, new_nav)
    content = content.replace(old_nav2, new_nav)
    
    with open(file, 'w', encoding='utf-8') as f:
        f.write(content)

# 2. Update client-portal and admin-panel files
for portal_dir in ['client-portal', 'admin-panel']:
    for filename in os.listdir(portal_dir):
        if filename.endswith('.html'):
            filepath = os.path.join(portal_dir, filename)
            with open(filepath, 'r', encoding='utf-8') as f:
                content = f.read()
                
            # Replace mobile header
            old_mobile = '''<span style="display:flex; align-items:center; gap:8px; font-family:'Playfair Display',serif;font-size:1.2rem;font-weight:700;color:var(--primary);">
          <img src="/img/logo.png" alt="Logo" style="height:28px; border-radius:50%;"> Beyond Kilo's
        </span>'''
            new_mobile = '''<span style="display:flex; align-items:center; gap:8px; text-decoration:none;">
          <img src="/img/logo.png" alt="Logo" style="height:32px; border-radius:50%;">
          <div style="display:flex; flex-direction:column; line-height:1.1;">
            <span style="font-family:'Playfair Display',serif; font-size:1.2rem; font-weight:700; color:var(--primary);">Beyond Kilo's</span>
            <span style="font-size:0.5rem; font-weight:600; text-transform:uppercase; letter-spacing:0.5px; color:var(--text-secondary);">Because real health was never about a number.</span>
          </div>
        </span>'''
            content = content.replace(old_mobile, new_mobile)
            
            # Replace sidebar
            old_sidebar = '''<div class="sidebar-brand" style="display:flex; align-items:center; gap:8px;">
        <img src="/img/logo.png" alt="Logo" style="height:32px; border-radius:50%;"> Beyond Kilo's
      </div>'''
            new_sidebar = '''<div class="sidebar-brand" style="display:flex; align-items:center; gap:8px; padding-bottom: 20px;">
        <img src="/img/logo.png" alt="Logo" style="height:40px; border-radius:50%;">
        <div style="display:flex; flex-direction:column; line-height:1.1; text-align:left;">
          <span style="font-family:'Playfair Display',serif; font-size:1.4rem; font-weight:700; color:var(--primary);">Beyond Kilo's</span>
          <span style="font-size:0.55rem; font-weight:600; text-transform:uppercase; letter-spacing:0.5px; color:var(--text-secondary);">Because real health was never about a number.</span>
        </div>
      </div>'''
            content = content.replace(old_sidebar, new_sidebar)
            
            with open(filepath, 'w', encoding='utf-8') as f:
                f.write(content)

print("Tagline successfully embedded under logo across all files.")

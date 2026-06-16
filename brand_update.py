import os
import re

directories = [
    '/Users/siddhantmanglam/Documents/Diet2Fit/frontend',
    '/Users/siddhantmanglam/Documents/Diet2Fit/admin-panel',
    '/Users/siddhantmanglam/Documents/Diet2Fit/client-portal',
    '/Users/siddhantmanglam/Documents/Diet2Fit/backend'
]

new_wa_msg = "Hello%20Team%20Beyond%20Kilos%2C%0A%0AI%20would%20like%20to%20book%20a%20consultation%20appointment.%0A%0APlease%20contact%20me%20to%20schedule%20the%20appointment.%20I%20look%20forward%20to%20hearing%20from%20your%20team%20soon.%0A%0AThank%20you."

# Find all href="https://wa.me/918306404335..." and replace with the new template
wa_pattern = re.compile(r'href="https://wa\.me/918306404335(\?text=[^"]*)?"')

for directory in directories:
    for root, dirs, files in os.walk(directory):
        if 'node_modules' in root or '.git' in root:
            continue
        for filename in files:
            if filename.endswith((".html", ".js", ".json", ".css")):
                filepath = os.path.join(root, filename)
                try:
                    with open(filepath, 'r', encoding='utf-8') as f:
                        content = f.read()
                except UnicodeDecodeError:
                    continue
                
                updated_content = content
                
                # Replace Beyond Kilo's with Beyond Kilos
                if "Beyond Kilo's" in updated_content:
                    updated_content = updated_content.replace("Beyond Kilo's", "Beyond Kilos")
                if "Beyond Kilo\\'s" in updated_content:
                    updated_content = updated_content.replace("Beyond Kilo\\'s", "Beyond Kilos")
                
                # Replace wa.me links
                if "wa.me/918306404335" in updated_content:
                    updated_content = wa_pattern.sub(f'href="https://wa.me/918306404335?text={new_wa_msg}"', updated_content)
                
                if updated_content != content:
                    with open(filepath, 'w', encoding='utf-8') as f:
                        f.write(updated_content)
                    print(f"Updated {filepath}")

print("Update complete.")

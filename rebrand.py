import os
import re

directories = ['frontend', 'client-portal', 'admin-panel', 'backend']

for root_dir in directories:
    for dirpath, _, filenames in os.walk(root_dir):
        for filename in filenames:
            if filename.endswith(('.html', '.js', '.css', '.json', '.env.example')):
                filepath = os.path.join(dirpath, filename)
                with open(filepath, 'r', encoding='utf-8') as f:
                    content = f.read()
                
                # Replace JS Object properties
                content = re.sub(r'Diet2Fit\.', 'BeyondKilos.', content)
                content = re.sub(r'window\.Diet2Fit', 'window.BeyondKilos', content)
                
                # Replace remaining Diet2Fit with "Beyond Kilo's"
                content = content.replace('Diet2Fit', "Beyond Kilo's")
                
                with open(filepath, 'w', encoding='utf-8') as f:
                    f.write(content)
print("Rebranding text replacements complete.")

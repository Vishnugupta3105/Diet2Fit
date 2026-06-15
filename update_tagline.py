import os
import re

old_tagline = "Because real health was never about a number."
new_tagline = "Kilos are a symptom. Metabolism is the answer."

directories = [
    '/Users/siddhantmanglam/Documents/Diet2Fit/frontend',
    '/Users/siddhantmanglam/Documents/Diet2Fit/admin-panel',
    '/Users/siddhantmanglam/Documents/Diet2Fit/client-portal'
]

for directory in directories:
    for filename in os.listdir(directory):
        if filename.endswith(".html"):
            filepath = os.path.join(directory, filename)
            with open(filepath, 'r', encoding='utf-8') as f:
                content = f.read()
            
            if old_tagline in content:
                content = content.replace(old_tagline, new_tagline)
                with open(filepath, 'w', encoding='utf-8') as f:
                    f.write(content)
                print(f"Updated {filepath}")

print("Tagline update complete.")

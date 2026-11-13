import glob
import json
import re

strings = set()
for path in sorted(glob.glob('files/www/luci-static/resources/view/runet-fix/*.js')):
    with open(path, encoding='utf-8') as f:
        content = f.read()
    # Match _('...') or _("...")
    matches = re.findall(r'_\(\s*(\'(?:[^\'\\]|\\.)*\'|"(?:[^"\\]|\\.)*")\s*\)', content)
    for m in matches:
        raw = m[1:-1]
        raw = raw.replace(r'\'', "'").replace(r'\"', '"').replace(r'\n', '\n')
        strings.add(raw)

with open('files/usr/share/luci/menu.d/luci-app-runet-fix.json', encoding='utf-8') as f:
    menu = json.load(f)
for k, v in menu.items():
    if 'title' in v:
        strings.add(v['title'])

print(f"Total {len(strings)} strings found:")
for s in sorted(strings):
    print(repr(s))

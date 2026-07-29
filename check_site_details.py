import urllib.request, json

token = "nfc_nyWHAgakwMHNprmJH3AhnAfQVNCsXFEe91f9"
site_id = "8e22442c-6a55-47ef-bbf4-16e6cc3ef6b1"

req = urllib.request.Request("https://api.netlify.com/api/v1/sites/" + site_id)
req.add_header("Authorization", "Bearer " + token)
resp = urllib.request.urlopen(req)
d = json.loads(resp.read())

# Print selected fields
fields = ["name", "url", "functions_domain", "functions_url", "capabilities", "features", "build_settings", "plugins", "processing_settings", "plan"]
for f in fields:
    val = d.get(f)
    if val is not None:
        print(f + ":")
        print(json.dumps(val, indent=2, ensure_ascii=False))
        print()

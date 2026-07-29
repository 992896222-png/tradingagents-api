import urllib.request, json

token = "nfc_nyWHAgakwMHNprmJH3AhnAfQVNCsXFEe91f9"
site_id = "8e22442c-6a55-47ef-bbf4-16e6cc3ef6b1"

req = urllib.request.Request("https://api.netlify.com/api/v1/sites/" + site_id + "/deploys?per_page=20")
req.add_header("Authorization", "Bearer " + token)
resp = urllib.request.urlopen(req)
deploys = json.loads(resp.read())
for d in deploys:
    print("ID:", d["id"][:20])
    print("State:", d.get("state"))
    print("Title:", str(d.get("title",""))[:50])
    print("Functions:", d.get("available_functions",[]))
    print("Error:", str(d.get("error_message",""))[:50])
    print("---")

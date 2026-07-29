import urllib.request, json, os

token = "nfc_nyWHAgakwMHNprmJH3AhnAfQVNCsXFEe91f9"
site_id = "8e22442c-6a55-47ef-bbf4-16e6cc3ef6b1"
zip_path = "C:\\Users\\Hope\\Documents\\Codex\\2026-07-29\\a\\netlify-tradingapi\\deploy.zip"

with open(zip_path, "rb") as f:
    zip_data = f.read()

print("Zip size:", len(zip_data), "bytes")

req = urllib.request.Request(
    "https://api.netlify.com/api/v1/sites/" + site_id + "/deploys",
    data=zip_data,
    headers={
        "Authorization": "Bearer " + token,
        "Content-Type": "application/zip",
    },
    method="POST"
)

resp = urllib.request.urlopen(req)
result = json.loads(resp.read())
print("Deploy ID:", result.get("id"))
print("State:", result.get("state"))
print("Required functions:", result.get("required_functions", []))
print("Available functions:", result.get("available_functions", []))
print("Error:", result.get("error_message"))

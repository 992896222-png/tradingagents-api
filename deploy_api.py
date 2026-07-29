"""
Deploy TradingAgents Python function to Netlify via API.
"""
import base64
import hashlib
import json
import os
import subprocess
import sys

SITE_ID = "dae10eea-88b8-40d0-a489-c5e05940f66e"
BASE_DIR = r"C:\Users\Hope\Documents\Codex\2026-07-29\a\netlify-tradingapi"


def run_netlify_api(method, data, timeout=30):
    """Run a Netlify CLI API command and return parsed JSON."""
    data_json = json.dumps(data)
    result = subprocess.run(
        ["npx", "netlify", "api", method, "--data", data_json],
        capture_output=True,
        text=True,
        cwd=BASE_DIR,
        timeout=timeout,
        shell=True,
    )
    if result.returncode != 0:
        print(f"  Error running {method}: {result.stderr[:200]}")
        return None
    try:
        return json.loads(result.stdout) if result.stdout.strip() else {}
    except json.JSONDecodeError:
        print(f"  Output: {result.stdout[:200]}")
        return None


def main():
    # Step 1: Build file manifest
    site_files = {}
    for fname in ["index.html", "netlify.toml", "requirements.txt", ".env.example"]:
        fp = os.path.join(BASE_DIR, fname)
        if os.path.exists(fp):
            with open(fp, "rb") as f:
                content = f.read()
            site_files[fname] = hashlib.sha256(content).hexdigest()
            print(f"  {fname}: {len(content)} bytes")

    fn_path = os.path.join(BASE_DIR, "netlify", "functions", "analyze.py")
    with open(fn_path, "rb") as f:
        fn_content = f.read()
    fn_hash = hashlib.sha256(fn_content).hexdigest()
    print(f"  analyze.py (function): {len(fn_content)} bytes")

    # Step 2: Create deploy
    print("\nStep 1: Creating deploy...")
    deploy = run_netlify_api(
        "createSiteDeploy",
        {
            "site_id": SITE_ID,
            "files": site_files,
            "functions": {"analyze": fn_hash},
            "async": False,
        },
        timeout=30,
    )

    if not deploy:
        print("Failed to create deploy")
        sys.exit(1)

    deploy_id = deploy.get("id")
    print(f"  Deploy ID: {deploy_id}")
    print(f"  State: {deploy.get('state')}")
    print(f"  Required files: {deploy.get('required', [])}")
    print(f"  Required functions: {deploy.get('required_functions', [])}")

    if not deploy_id:
        print(f"  Error: {deploy}")
        sys.exit(1)

    # Step 3: Upload required files via the CLI
    required = deploy.get("required", [])
    required_fn = deploy.get("required_functions", [])

    print("\nStep 2: Uploading site files...")

    # For manual deploy, we need to use netlify deploy instead
    # Let's just use the CLI's native deploy command which handles file uploads
    print("\nFiles created in deploy. Running netlify deploy to upload...")
    result = subprocess.run(
        ["npx", "netlify", "deploy", "--prod", "--dir", "."],
        capture_output=True,
        text=True,
        cwd=BASE_DIR,
        timeout=120,
        shell=True,
    )
    print(result.stdout[-500:] if len(result.stdout) > 500 else result.stdout)
    if result.stderr:
        print(f"Stderr: {result.stderr[-300:]}")

    # Step 4: Now try to upload the function separately via API
    print("\nStep 3: Uploading Python function via API...")
    
    import requests
    
    TOKEN = "nfc_nyWHAgakwMHNprmJH3AhnAfQVNCsXFEe91f9"
    
    # Read the function file
    with open(fn_path, "rb") as f:
        fn_data = f.read()
    
    # Try uploading with multipart form including language
    r = requests.put(
        f"https://api.netlify.com/api/v1/deploys/{deploy_id}/functions/analyze",
        headers={"Authorization": f"Bearer {TOKEN}"},
        files=[
            ("file", ("analyze.py", fn_data, "application/octet-stream")),
            ("language", (None, "python")),
            ("runtime", (None, "python")),
        ],
    )
    print(f"  Function upload: {r.status_code}")
    print(f"  Response: {r.text[:300]}")

    # Step 5: Verify
    print("\nStep 4: Verifying deploy...")
    d = run_netlify_api(
        "getSiteDeploy",
        {"site_id": SITE_ID, "deploy_id": deploy_id},
        timeout=15,
    )
    if d:
        print(f"  State: {d.get('state')}")
        print(f"  Available functions: {d.get('available_functions', [])}")

    print(f"\nDone! Site URL: https://tradingagents-api.netlify.app")


if __name__ == "__main__":
    main()

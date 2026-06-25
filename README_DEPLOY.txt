RideHero Final Cloudflare Bundle

Upload BOTH files in this folder to the root of your GitHub repo:
- index.html
- animal_kingdom_app_map.png

Important:
- Do not upload only index.html.
- Do not rename animal_kingdom_app_map.png.
- The route page uses the full Animal Kingdom image map when Animal Kingdom is selected.
- If you still see the simple pastel mini-map, Cloudflare is serving an older index.html.

Cloudflare fix:
1. Commit these two files to GitHub.
2. Wait for Cloudflare Pages to redeploy.
3. In Cloudflare, go to Caching > Configuration > Purge Everything.
4. Hard refresh the preview URL.

Quick test:
Open this URL in your deployed site:
  /animal_kingdom_app_map.png

If the image opens, the asset path is correct.
assets/README
=================

This folder contains vendor assets used by the app to avoid relying on third-party CDNs. Currently the repository includes small placeholder stubs so the UI does not fail when CDNs are blocked.

Recommended: replace the placeholder files with the official library files (minified) to restore full functionality.

Commands to download the real files (run locally from the repository root):

# Create assets directory if it doesn't exist
mkdir -p assets

# Download Bootstrap CSS and JS (v5.3.0)
curl -L https://cdn.jsdelivr.net/npm/bootstrap@5.3.0/dist/css/bootstrap.min.css -o assets/bootstrap.min.css
curl -L https://cdn.jsdelivr.net/npm/bootstrap@5.3.0/dist/js/bootstrap.bundle.min.js -o assets/bootstrap.bundle.min.js

# Download xlsx library
curl -L https://cdnjs.cloudflare.com/ajax/libs/xlsx/0.18.5/xlsx.full.min.js -o assets/xlsx.full.min.js

# Download html2pdf library
curl -L https://cdnjs.cloudflare.com/ajax/libs/html2pdf.js/0.10.1/html2pdf.bundle.min.js -o assets/html2pdf.bundle.min.js

Notes
-----
- After replacing the files, open index.html to confirm the page loads correctly and that features like modals, collapse, Excel export and PDF export work as expected.
- If you prefer to use CDN with local fallback, update index.html accordingly or ask me to switch strategy.

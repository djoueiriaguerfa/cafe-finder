# ☕ Cafe Finder

A vanilla JavaScript web app that finds cafes near you using live Google Maps data.

## Features
- Auto-detects your location and lists nearby cafes (Places API, new version)
- Map markers + list that stay in sync (click either to focus)
- Filters: open now, minimum rating, search radius
- Sort by rating, most reviewed, or distance
- Favorites saved in your browser (localStorage)
- "Search this area" after panning the map

## Setup
1. Go to Google Cloud Console and create a project.
2. Enable **Maps JavaScript API** and **Places API (New)**, and turn on billing (Google offers a free monthly credit).
3. Create an API key and restrict it to your site's domain (HTTP referrers), e.g. `http://localhost:*`.
4. Paste the key into `config.js`.

## Run
Geolocation needs `localhost` or HTTPS, so serve the folder instead of opening the file directly:

```bash
npx serve .
# or
python3 -m http.server 8000
```

Then open the printed URL (e.g. http://localhost:8000).

## Files
- `index.html` – layout
- `style.css` – styling
- `config.js` – API key + default location
- `app.js` – map, search, filters, favorites

## Ideas for next steps
- Search by text ("quiet cafe with wifi") using `Place.searchByText`
- Show details such as opening hours and reviews in a side panel
- Directions to the selected cafe
- A PWA manifest so it installs on a phone

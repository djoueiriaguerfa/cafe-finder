// Cafe Finder — live cafe data from the Google Maps Places API (New).

const CONFIG = window.CAFE_FINDER_CONFIG;
const FAV_KEY = "cafeFinder.favorites";

const els = {
  radius: document.getElementById("radius"),
  radiusLabel: document.getElementById("radiusLabel"),
  openNow: document.getElementById("openNow"),
  minRating: document.getElementById("minRating"),
  sortBy: document.getElementById("sortBy"),
  favOnly: document.getElementById("favOnly"),
  locateBtn: document.getElementById("locateBtn"),
  searchAreaBtn: document.getElementById("searchAreaBtn"),
  status: document.getElementById("status"),
  results: document.getElementById("results"),
};

let map, Place, SearchNearbyRankPreference, AdvancedMarkerElement, PinElement;
let center = CONFIG.DEFAULT_CENTER;
let cafes = []; // enriched place objects
let markers = new Map(); // place id -> marker
let userMarker = null;
let favorites = loadFavorites();

/* ---------- helpers ---------- */

function loadFavorites() {
  try {
    return new Set(JSON.parse(localStorage.getItem(FAV_KEY) || "[]"));
  } catch {
    return new Set();
  }
}

function saveFavorites() {
  try {
    localStorage.setItem(FAV_KEY, JSON.stringify([...favorites]));
  } catch {
    /* storage unavailable: favorites just won't persist */
  }
}

function setStatus(msg, isError = false) {
  els.status.textContent = msg;
  els.status.classList.toggle("error", isError);
}

function distanceMeters(a, b) {
  const R = 6371000;
  const toRad = (d) => (d * Math.PI) / 180;
  const dLat = toRad(b.lat - a.lat);
  const dLng = toRad(b.lng - a.lng);
  const h =
    Math.sin(dLat / 2) ** 2 +
    Math.cos(toRad(a.lat)) * Math.cos(toRad(b.lat)) * Math.sin(dLng / 2) ** 2;
  return 2 * R * Math.asin(Math.sqrt(h));
}

function formatDistance(m) {
  return m < 1000 ? `${Math.round(m)} m` : `${(m / 1000).toFixed(1)} km`;
}

function loadGoogleMaps() {
  return new Promise((resolve, reject) => {
    if (!CONFIG.GOOGLE_MAPS_API_KEY || CONFIG.GOOGLE_MAPS_API_KEY === "YOUR_API_KEY_HERE") {
      reject(new Error("Add your Google Maps API key to config.js first."));
      return;
    }
    window.__onMapsReady = resolve;
    const s = document.createElement("script");
    s.src =
      "https://maps.googleapis.com/maps/api/js?key=" +
      encodeURIComponent(CONFIG.GOOGLE_MAPS_API_KEY) +
      "&v=weekly&loading=async&callback=__onMapsReady";
    s.async = true;
    s.onerror = () => reject(new Error("Could not load Google Maps."));
    document.head.appendChild(s);
  });
}

/* ---------- map + search ---------- */

async function initMap() {
  await loadGoogleMaps();
  const { Map } = await google.maps.importLibrary("maps");
  ({ AdvancedMarkerElement, PinElement } = await google.maps.importLibrary("marker"));
  ({ Place, SearchNearbyRankPreference } = await google.maps.importLibrary("places"));

  map = new Map(document.getElementById("map"), {
    center,
    zoom: 15,
    mapId: "DEMO_MAP_ID",
    mapTypeControl: false,
    streetViewControl: false,
  });

  await locateUser();
}

function locateUser() {
  return new Promise((resolve) => {
    if (!navigator.geolocation) {
      setStatus("Geolocation not supported, using the default area.");
      searchCafes().then(resolve);
      return;
    }
    setStatus("Finding your location…");
    navigator.geolocation.getCurrentPosition(
      (pos) => {
        center = { lat: pos.coords.latitude, lng: pos.coords.longitude };
        map.setCenter(center);
        placeUserMarker();
        searchCafes().then(resolve);
      },
      () => {
        setStatus("Location denied, showing the default area. Pan the map and press “Search this area”.");
        searchCafes().then(resolve);
      },
      { enableHighAccuracy: true, timeout: 8000 }
    );
  });
}

function placeUserMarker() {
  if (userMarker) userMarker.map = null;
  const dot = document.createElement("div");
  dot.style.cssText =
    "width:16px;height:16px;border-radius:50%;background:#1a73e8;border:3px solid #fff;box-shadow:0 0 0 2px #1a73e8";
  userMarker = new AdvancedMarkerElement({ map, position: center, content: dot, title: "You are here" });
}

async function searchCafes() {
  setStatus("Searching for cafes…");
  try {
    const { places } = await Place.searchNearby({
      fields: [
        "id",
        "displayName",
        "location",
        "formattedAddress",
        "rating",
        "userRatingCount",
        "priceLevel",
        "photos",
        "googleMapsURI",
        "regularOpeningHours",
      ],
      locationRestriction: { center, radius: Number(els.radius.value) },
      includedPrimaryTypes: ["cafe", "coffee_shop"],
      maxResultCount: 20,
      rankPreference: SearchNearbyRankPreference.POPULARITY,
    });

    cafes = await Promise.all(
      places.map(async (p) => {
        let openNow = null;
        try {
          openNow = p.regularOpeningHours ? await p.isOpen() : null;
        } catch {
          openNow = null;
        }
        const loc = { lat: p.location.lat(), lng: p.location.lng() };
        return {
          id: p.id,
          name: p.displayName || "Unnamed cafe",
          address: p.formattedAddress || "",
          rating: p.rating ?? 0,
          reviews: p.userRatingCount ?? 0,
          openNow,
          loc,
          distance: distanceMeters(center, loc),
          photoUrl: p.photos?.[0]?.getURI({ maxWidth: 200, maxHeight: 200 }) || null,
          url: p.googleMapsURI,
        };
      })
    );
    render();
  } catch (err) {
    console.error(err);
    setStatus("Search failed: " + (err.message || "unknown error"), true);
  }
}

/* ---------- rendering ---------- */

function visibleCafes() {
  const minRating = Number(els.minRating.value);
  let list = cafes.filter((c) => c.rating >= minRating);
  if (els.openNow.checked) list = list.filter((c) => c.openNow === true);
  if (els.favOnly.checked) list = list.filter((c) => favorites.has(c.id));

  const sorters = {
    rating: (a, b) => b.rating - a.rating || b.reviews - a.reviews,
    reviews: (a, b) => b.reviews - a.reviews,
    distance: (a, b) => a.distance - b.distance,
  };
  return list.sort(sorters[els.sortBy.value]);
}

function render() {
  const list = visibleCafes();

  // markers
  markers.forEach((m) => (m.map = null));
  markers.clear();
  list.forEach((c) => {
    const pin = new PinElement({
      background: favorites.has(c.id) ? "#c62828" : "#b5651d",
      borderColor: "#fff",
      glyphColor: "#fff",
    });
    const marker = new AdvancedMarkerElement({
      map,
      position: c.loc,
      content: pin.element,
      title: c.name,
    });
    marker.addListener("click", () => focusCafe(c.id, true));
    markers.set(c.id, marker);
  });

  // list
  els.results.replaceChildren(...list.map(buildCard));
  setStatus(list.length ? `${list.length} cafe${list.length === 1 ? "" : "s"} found` : "No cafes match your filters.");
}

function buildCard(c) {
  const li = document.createElement("li");
  li.className = "card";
  li.dataset.id = c.id;

  const media = c.photoUrl ? document.createElement("img") : document.createElement("div");
  if (c.photoUrl) {
    media.src = c.photoUrl;
    media.alt = "";
    media.loading = "lazy";
  } else {
    media.className = "noimg";
    media.textContent = "☕";
  }

  const info = document.createElement("div");
  const h = document.createElement("h3");
  h.textContent = c.name;

  const rating = document.createElement("p");
  rating.textContent = c.rating
    ? `⭐ ${c.rating.toFixed(1)} (${c.reviews.toLocaleString()}) · ${formatDistance(c.distance)}`
    : `No ratings yet · ${formatDistance(c.distance)}`;

  const status = document.createElement("p");
  const badge = document.createElement("span");
  badge.className = "badge";
  if (c.openNow === true) { badge.textContent = "Open now"; badge.classList.add("open"); }
  else if (c.openNow === false) { badge.textContent = "Closed"; badge.classList.add("closed"); }
  else badge.textContent = "Hours unknown";
  status.appendChild(badge);

  const addr = document.createElement("p");
  addr.textContent = c.address;

  info.append(h, rating, status, addr);

  if (c.url) {
    const a = document.createElement("a");
    a.href = c.url;
    a.target = "_blank";
    a.rel = "noopener";
    a.textContent = "Open in Google Maps";
    a.addEventListener("click", (e) => e.stopPropagation());
    info.appendChild(a);
  }

  const fav = document.createElement("button");
  fav.className = "fav";
  fav.title = "Toggle favorite";
  fav.textContent = favorites.has(c.id) ? "❤️" : "🤍";
  fav.addEventListener("click", (e) => {
    e.stopPropagation();
    favorites.has(c.id) ? favorites.delete(c.id) : favorites.add(c.id);
    saveFavorites();
    render();
  });

  li.append(media, info, fav);
  li.addEventListener("click", () => focusCafe(c.id, false));
  return li;
}

function focusCafe(id, scrollList) {
  const c = cafes.find((x) => x.id === id);
  if (!c) return;
  map.panTo(c.loc);
  map.setZoom(Math.max(map.getZoom(), 16));
  document.querySelectorAll(".card").forEach((el) => el.classList.toggle("active", el.dataset.id === id));
  if (scrollList) document.querySelector(`.card[data-id="${CSS.escape(id)}"]`)?.scrollIntoView({ block: "nearest", behavior: "smooth" });
}

/* ---------- events ---------- */

els.radius.addEventListener("input", () => {
  els.radiusLabel.textContent = (els.radius.value / 1000).toFixed(2).replace(/\.?0+$/, "") + " km";
});
els.radius.addEventListener("change", () => searchCafes());
[els.openNow, els.minRating, els.sortBy, els.favOnly].forEach((el) => el.addEventListener("change", () => cafes.length && render()));
els.locateBtn.addEventListener("click", () => locateUser());
els.searchAreaBtn.addEventListener("click", () => {
  const c = map.getCenter();
  center = { lat: c.lat(), lng: c.lng() };
  searchCafes();
});

initMap().catch((err) => setStatus(err.message, true));

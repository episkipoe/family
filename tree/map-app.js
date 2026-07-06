(async function () {
  const summary = document.querySelector("#map-summary");
  const list = document.querySelector("#location-list");
  const searchInput = document.querySelector("#map-search");
  const openMap = document.querySelector("#open-map");
  const showAllButton = document.querySelector("#show-all");

  const CITY_COORDINATES = {
    "AZ": { lat: 34.0489, lng: -111.0937 },
    "Ajo, AZ": { lat: 32.3717, lng: -112.8607 },
    "Arlington, TX": { lat: 32.7357, lng: -97.1081 },
    "Austin, TX": { lat: 30.2672, lng: -97.7431 },
    "Ballwin, MO": { lat: 38.5951, lng: -90.5462 },
    "Clarksville, AR": { lat: 35.4715, lng: -93.4666 },
    "Corfu, NY": { lat: 42.9606, lng: -78.4056 },
    "Energy, IL": { lat: 37.7731, lng: -89.0262 },
    "Fox Lake, IL": { lat: 42.3967, lng: -88.1837 },
    "Freeport, IL": { lat: 42.2967, lng: -89.6212 },
    "Gurnee, IL": { lat: 42.3703, lng: -87.9020 },
    "Kenosha, WI": { lat: 42.5847, lng: -87.8212 },
    "Lake Villa, IL": { lat: 42.4169, lng: -88.0739 },
    "Lisle, IL": { lat: 41.8011, lng: -88.0748 },
    "Oak Creek, WI": { lat: 42.8859, lng: -87.8631 },
    "Racine, WI": { lat: 42.7261, lng: -87.7829 },
    "Reston, VA": { lat: 38.9586, lng: -77.3570 },
    "Seattle, WA": { lat: 47.6061, lng: -122.3328 }
  };

  const people = await loadFamilyMembers();
  const locations = groupByLocation(people);
  let visibleLocations = locations;
  let visibleMarkerLocations = locations.filter((location) => location.coordinate);
  const map = L.map("family-map", {
    scrollWheelZoom: true,
    worldCopyJump: true
  });
  const markerLayer = L.layerGroup().addTo(map);
  const markerByLocation = new Map();

  L.tileLayer("https://{s}.tile.openstreetmap.org/{z}/{x}/{y}.png", {
    maxZoom: 18,
    attribution: '&copy; <a href="https://www.openstreetmap.org/copyright">OpenStreetMap</a> contributors'
  }).addTo(map);

  applySearch("");

  showAllButton.addEventListener("click", showAll);
  searchInput.addEventListener("input", () => applySearch(searchInput.value));

  async function loadFamilyMembers() {
    const response = await fetch("/api/family/tree");
    if (!response.ok) throw new Error("Unable to load family tree data.");
    return await response.json();
  }

  function groupByLocation(members) {
    const grouped = new Map();
    members.forEach((member) => {
      locationList(member.location).forEach((location) => {
        if (!grouped.has(location)) grouped.set(location, []);
        grouped.get(location).push(member);
      });
    });

    return [...grouped.entries()]
      .map(([location, residents]) => ({
        location,
        coordinate: CITY_COORDINATES[location] || null,
        residents: residents.sort((a, b) => a.name.localeCompare(b.name) || a.id - b.id)
      }))
      .sort((a, b) => a.location.localeCompare(b.location));
  }

  function locationList(value) {
    const values = Array.isArray(value) ? value : [value];
    const seen = new Set();
    const locations = [];

    values.forEach((entry) => {
      const location = String(entry || "").trim();
      const key = location.toLowerCase();
      if (!location || seen.has(key)) return;
      seen.add(key);
      locations.push(location);
    });

    return locations;
  }

  function applySearch(value) {
    const query = String(value || "").trim().toLowerCase();
    visibleLocations = query ? locations.filter((item) => locationMatches(item, query)) : locations;
    visibleMarkerLocations = visibleLocations.filter((location) => location.coordinate);
    renderSummary(visibleLocations, visibleMarkerLocations, query);
    renderLocations(visibleLocations);
    renderMarkers(visibleMarkerLocations);
    fitVisibleMarkers();
  }

  function locationMatches(item, query) {
    return item.location.toLowerCase().includes(query)
      || item.residents.some((person) => person.name.toLowerCase().includes(query));
  }

  function renderSummary(items, markerItems, query = "") {
    const peopleCount = items.reduce((total, item) => total + item.residents.length, 0);
    const missingCount = items.filter((item) => !item.coordinate).length;
    const prefix = query ? "Matching " : "";
    summary.textContent = items.length
      ? `${prefix}${peopleCount} family members across ${items.length} listed locations. ${markerItems.length} city markers are shown.`
      : query ? "No matching people or locations." : "No family members have a listed location yet.";
    if (missingCount) summary.textContent += ` ${missingCount} locations need coordinates.`;
  }

  function renderLocations(items) {
    list.innerHTML = items.length ? items.map((item) => `
      <article class="location-card">
        <h2>${escapeHtml(item.location)}</h2>
        <div class="name-list">
          ${item.residents.map((person) => `
            <a class="person-link" href="tree.html?id=${person.id}" data-person-id="${person.id}" data-location="${escapeAttribute(item.location)}">${escapeHtml(person.name)}</a>
          `).join("")}
        </div>
        <button class="button-link" type="button" data-map-location="${escapeAttribute(item.location)}">Show on map</button>
      </article>
    `).join("") : `<p class="empty">Add locations from a person profile to populate the map.</p>`;

    list.querySelectorAll("[data-map-location]").forEach((button) => {
      button.addEventListener("click", () => showLocation(button.dataset.mapLocation));
    });
    list.querySelectorAll("[data-person-id]").forEach((link) => {
      link.addEventListener("mouseenter", () => openLocationMarker(link.dataset.location));
      link.addEventListener("focus", () => openLocationMarker(link.dataset.location));
    });
  }

  function renderMarkers(markerItems) {
    markerLayer.clearLayers();
    markerByLocation.clear();

    markerItems.forEach((item) => {
      const marker = L.marker([item.coordinate.lat, item.coordinate.lng], { icon: markerIcon(item.residents.length) })
        .bindPopup(cityPopup(item), { minWidth: 360, maxWidth: 500 });
      marker.addTo(markerLayer);
      markerByLocation.set(item.location, marker);
    });
  }

  function showAll() {
    searchInput.value = "";
    visibleLocations = locations;
    visibleMarkerLocations = locations.filter((location) => location.coordinate);
    renderSummary(visibleLocations, visibleMarkerLocations);
    renderLocations(visibleLocations);
    renderMarkers(visibleMarkerLocations);
    fitVisibleMarkers();
  }

  function fitVisibleMarkers() {
    if (!visibleMarkerLocations.length) {
      map.setView([39.5, -98.35], 4);
      openMap.href = "https://www.google.com/maps";
      return;
    }
    map.fitBounds(L.latLngBounds(visibleMarkerLocations.map((item) => [item.coordinate.lat, item.coordinate.lng])), {
      padding: [34, 34],
      maxZoom: 5
    });
    openMap.href = "https://www.openstreetmap.org/#map=4/39.50/-98.35";
  }

  function showLocation(location) {
    const selected = visibleMarkerLocations.find((item) => item.location === location);
    if (!selected) return;
    map.setView([selected.coordinate.lat, selected.coordinate.lng], 11);
    openLocationMarker(location);
    openMap.href = `https://www.openstreetmap.org/search?query=${encodeURIComponent(location)}`;
  }

  function openLocationMarker(location) {
    const marker = markerByLocation.get(location);
    if (!marker) return;
    marker.openPopup();
  }

  function markerIcon(count) {
    return L.divIcon({
      className: "",
      html: `<span class="family-marker" aria-hidden="true">${count}</span>`,
      iconSize: [28, 28],
      iconAnchor: [14, 14],
      popupAnchor: [0, -14]
    });
  }

  function cityPopup(item) {
    return `
      <div class="family-popup">
        <strong>${escapeHtml(item.location)}</strong>
        <span>${item.residents.length} ${item.residents.length === 1 ? "person" : "people"}</span>
        <ul>
          ${item.residents.map((person) => `
            <li><a href="tree.html?id=${person.id}">${escapeHtml(person.name)}</a></li>
          `).join("")}
        </ul>
      </div>
    `;
  }

  function escapeHtml(value) {
    return String(value)
      .replace(/&/g, "&amp;")
      .replace(/</g, "&lt;")
      .replace(/>/g, "&gt;")
      .replace(/"/g, "&quot;")
      .replace(/'/g, "&#039;");
  }

  function escapeAttribute(value) {
    return escapeHtml(value).replace(/`/g, "&#096;");
  }
})();

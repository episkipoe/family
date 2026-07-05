async function loadLocations() {
  const response = await fetch('/api/travel/locations');
  if (!response.ok) throw new Error('Unable to load travel locations.');
  return response.json();
}

function markerRadius(location) {
  return Math.min(18, 7 + Math.sqrt(location.referenceCount) * 2);
}

function listItem(location) {
  const item = document.createElement('a');
  item.className = 'travel-list-item';
  item.href = `/travel/go/${encodeURIComponent(location.id)}`;
  item.innerHTML = `
    <strong>${location.name}</strong>
    <span>${location.referenceCount} docs · ${location.totalHits} mentions</span>
  `;
  return item;
}

loadLocations()
  .then(({ locations }) => {
    const map = L.map('travelMap', { scrollWheelZoom: true }).setView([25, -20], 2);
    L.tileLayer('https://{s}.tile.openstreetmap.org/{z}/{x}/{y}.png', {
      maxZoom: 18,
      attribution: '&copy; OpenStreetMap contributors'
    }).addTo(map);

    const bounds = [];
    const list = document.querySelector('#travelList');
    document.querySelector('#locationCount').textContent = `${locations.length} places`;

    locations.forEach((location) => {
      bounds.push([location.lat, location.lng]);
      const marker = L.circleMarker([location.lat, location.lng], {
        radius: markerRadius(location),
        color: location.theme === 'cyberpunk' ? '#00fff0' : '#0e6377',
        fillColor: location.theme === 'cyberpunk' ? '#ff2bd6' : '#f6b73c',
        fillOpacity: 0.78,
        weight: 2
      }).addTo(map);

      marker.bindPopup(`
        <strong>${location.name}</strong><br>
        ${location.referenceCount} docs · ${location.totalHits} mentions<br>
        <a href="/travel/go/${encodeURIComponent(location.id)}">Open</a>
      `);
      marker.on('click', () => {
        window.location.href = `/travel/go/${encodeURIComponent(location.id)}`;
      });
      list.append(listItem(location));
    });

    if (bounds.length) map.fitBounds(bounds, { padding: [28, 28] });
  })
  .catch((error) => {
    document.querySelector('#locationCount').textContent = 'Map unavailable';
    document.querySelector('#travelList').textContent = error.message;
  });

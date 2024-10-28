// Initialize maps and get location
document.addEventListener('DOMContentLoaded', function() {
    // Get user's location
    if (navigator.geolocation) {
        navigator.geolocation.getCurrentPosition(successLocation, errorLocation);
    }

    // Initialize the SOS button
    document.getElementById('sos-button').addEventListener('click', launchSOSPlan);
});

// Success callback for geolocation
function successLocation(position) {
    const latitude = position.coords.latitude;
    const longitude = position.coords.longitude;
    
    // Display coordinates
    document.getElementById('coordinates').textContent = 
        `Latitude: ${latitude}, Longitude: ${longitude}`;

    // Initialize main map
    initializeMap(latitude, longitude);
    
    // Get weather data
    fetchWeatherData(latitude, longitude);
}

// Error callback for geolocation
function errorLocation() {
    alert('Unable to retrieve your location');
}

// Initialize Leaflet map
function initializeMap(lat, lon) {
    const map = L.map('map').setView([lat, lon], 13);
    L.tileLayer('https://{s}.tile.openstreetmap.org/{z}/{x}/{y}.png', {
        attribution: '© OpenStreetMap contributors'
    }).addTo(map);
    
    L.marker([lat, lon]).addTo(map)
        .bindPopup('Your Location')
        .openPopup();
}

// Basic weather data fetch (we'll add API key later)
async function fetchWeatherData(lat, lon) {
    // For now, just show a placeholder
    document.getElementById('weather-container').innerHTML = 
        '<p>Weather data will appear here</p>';
}

// Launch SOS Plan
function launchSOSPlan() {
    alert('SOS Plan feature coming soon!');
    // We'll add the actual navigation later
}

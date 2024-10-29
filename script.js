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
    
    // Get wildfire data
    fetchWildfireData(latitude, longitude);
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

// Weather data fetch with API
async function fetchWeatherData(lat, lon) {
    const API_KEY = '8224d2b200e0f0663e86aa1f3d1ea740';
    const url = `https://api.openweathermap.org/data/2.5/forecast?lat=${lat}&lon=${lon}&appid=${API_KEY}&units=metric`;
    
    // Helper function to get wind direction
    function getWindDirection(degrees) {
        const directions = ['N', 'NNE', 'NE', 'ENE', 'E', 'ESE', 'SE', 'SSE', 'S', 'SSW', 'SW', 'WSW', 'W', 'WNW', 'NW', 'NNW'];
        const index = Math.round(degrees / 22.5) % 16;
        return directions[index];
    }
    
    try {
        const response = await fetch(url);
        if (!response.ok) throw new Error('Weather API error');
        const data = await response.json();
        
        const weatherContainer = document.getElementById('weather-container');
        weatherContainer.innerHTML = '';
        
        const dailyForecasts = {};
        
        data.list.forEach(forecast => {
            const date = new Date(forecast.dt * 1000);
            const dateString = date.toLocaleDateString();
            
            if (!dailyForecasts[dateString]) {
                dailyForecasts[dateString] = forecast;
            }
        });
        
        Object.values(dailyForecasts).slice(0, 5).forEach(day => {
            const date = new Date(day.dt * 1000);
            const tempC = Math.round(day.main.temp);
            const tempF = Math.round((tempC * 9/5) + 32);
            const description = day.weather[0].description;
            const icon = day.weather[0].icon;
            const weatherMain = day.weather[0].main.toLowerCase();
            const humidity = day.main.humidity;
            const windSpeed = Math.round(day.wind.speed * 2.237); // Convert m/s to mph
            const windDir = getWindDirection(day.wind.deg); // Get wind direction
            
            const weatherCard = document.createElement('div');
            weatherCard.className = `weather-card weather-${weatherMain}`;
            weatherCard.innerHTML = `
                <div class="weather-date-container">
                    <div class="weather-day">${date.toLocaleDateString('en-US', { weekday: 'short' })}</div>
                    <div class="weather-date">${date.toLocaleDateString('en-US', { month: 'short', day: 'numeric' })}</div>
                </div>
                <img src="https://openweathermap.org/img/wn/${icon}@2x.png" alt="${description}">
                <div class="weather-temp">
                    <span class="temp-c">${tempC}°C</span>
                    <span class="temp-divider"> | </span>
                    <span class="temp-f">${tempF}°F</span>
                </div>
                <div class="weather-desc">${description}</div>
                <div class="weather-details">
                    <div class="humidity">💧 ${humidity}%</div>
                    <div class="wind">💨 ${windSpeed} mph ${windDir}</div>
                </div>
            `;
            
            weatherContainer.appendChild(weatherCard);
        });
    } catch (error) {
        console.error('Error fetching weather:', error);
        document.getElementById('weather-container').innerHTML = 
            '<p>Weather data temporarily unavailable. Please try again later.</p>';
    }
}

// Wildfire data fetch
async function fetchWildfireData(lat, lon) {
    try {
        // Using the exact service from the ArcGIS map you referenced
        const url = 'https://services3.arcgis.com/T4QMspbfLg3qTGWY/arcgis/rest/services/Current_WildlandFires/FeatureServer/0/query?where=1%3D1&outFields=*&geometryType=esriGeometryPoint&spatialRel=esriSpatialRelIntersects&returnGeometry=true&f=geojson';
        
        console.log('Fetching from URL:', url);
        
        const response = await fetch(url);
        if (!response.ok) throw new Error('Fire API error');
        const data = await response.json();
        
        console.log('Fire data received:', data);
        console.log('Number of fires found:', data.features ? data.features.length : 0);
        
        // Initialize wildfire map with national view
        const wildfireMap = L.map('wildfire-map').setView([39.8283, -98.5795], 4);
        L.tileLayer('https://{s}.tile.openstreetmap.org/{z}/{x}/{y}.png', {
            attribution: '© OpenStreetMap contributors'
        }).addTo(wildfireMap);

        if (data.features && data.features.length > 0) {
            data.features.forEach(feature => {
                const props = feature.properties;
                const coords = feature.geometry.coordinates;
                
                if (!coords || coords.length < 2) return;
                
                const lat = coords[1];
                const lon = coords[0];
                
                console.log(`Adding fire: ${props.IncidentName} at ${lat}, ${lon}`);
                
                // Determine size and color based on acres
                const acres = props.DailyAcres || 0;
                const radius = Math.max(Math.sqrt(acres) * 100, 5000); // Minimum radius of 5km
                
                const color = acres > 10000 ? '#FF0000' :
                            acres > 1000 ? '#FF4444' :
                            '#FF8888';

                // Create fire perimeter
                const fireMarker = L.circle([lat, lon], {
                    color: color,
                    fillColor: color,
                    fillOpacity: 0.4,
                    weight: 2,
                    radius: radius
                }).addTo(wildfireMap);

                // Add pulsing marker
                const pulsingIcon = L.divIcon({
                    className: 'pulsing-icon',
                    html: `<div class="pulsing-dot" style="background-color: ${color};"></div>`,
                    iconSize: [20, 20]
                });

                L.marker([lat, lon], { icon: pulsingIcon })
                    .addTo(wildfireMap)
                    .bindPopup(`
                        <div class="fire-popup">
                            <h3>${props.IncidentName || 'Active Fire'}</h3>
                            <p><strong>Size:</strong> ${props.DailyAcres ? Math.round(props.DailyAcres).toLocaleString() + ' acres' : 'N/A'}</p>
                            <p><strong>Containment:</strong> ${props.PercentContained || '0'}%</p>
                            <p><strong>Discovery:</strong> ${props.FireDiscoveryDateTime ? new Date(props.FireDiscoveryDateTime).toLocaleDateString() : 'N/A'}</p>
                            <p><strong>Location:</strong> ${props.POOState || 'N/A'}</p>
                            <p><strong>Status:</strong> ${props.IncidentManagementOrganization || 'Active'}</p>
                        </div>
                    `);
            });
        } else {
            console.log('No active fires found');
        }

        // Add legend
        const legend = L.control({position: 'bottomright'});
        legend.onAdd = function(map) {
            const div = L.DomUtil.create('div', 'info legend');
            div.innerHTML = `
                <div class="legend-container">
                    <h4>Fire Size</h4>
                    <div class="legend-item">
                        <span class="legend-color" style="background: #FF0000"></span>
                        <span>Large (>10,000 acres)</span>
                    </div>
                    <div class="legend-item">
                        <span class="legend-color" style="background: #FF4444"></span>
                        <span>Medium (1,000-10,000 acres)</span>
                    </div>
                    <div class="legend-item">
                        <span class="legend-color" style="background: #FF8888"></span>
                        <span>Small (<1,000 acres)</span>
                    </div>
                </div>
            `;
            return div;
        };
        legend.addTo(wildfireMap);

    } catch (error) {
        console.error('Error fetching wildfire data:', error);
        document.getElementById('wildfire-map').innerHTML = 
            '<p>Wildfire data temporarily unavailable. Please try again later.</p>';
    }
}
// Launch SOS Plan
function launchSOSPlan() {
    alert('SOS Plan feature coming soon!');
    // We'll add the actual navigation later
}

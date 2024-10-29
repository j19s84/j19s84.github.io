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
        // Using CalFire's active incidents endpoint
        const url = 'https://services3.arcgis.com/T4QMspbfLg3qTGWY/arcgis/rest/services/Public_Wildfire_Perimeters_View/FeatureServer/0/query?where=1%3D1&outFields=*&outSR=4326&f=json';
        
        console.log('Fetching from URL:', url);
        
        const response = await fetch(url);
        if (!response.ok) throw new Error('CalFire API error');
        const data = await response.json();
        
        console.log('Fire data received:', data);
        console.log('Number of fires found:', data.features ? data.features.length : 0);
        
        // Initialize wildfire map
        const wildfireMap = L.map('wildfire-map').setView([37.1841, -119.4696], 6); // Center on California
        L.tileLayer('https://{s}.tile.openstreetmap.org/{z}/{x}/{y}.png', {
            attribution: '© OpenStreetMap contributors'
        }).addTo(wildfireMap);

        if (data.features && data.features.length > 0) {
            data.features.forEach(feature => {
                if (!feature.geometry || !feature.geometry.rings) return;
                
                // Calculate center point of the fire perimeter
                const ring = feature.geometry.rings[0];
                let lat = 0, lon = 0;
                ring.forEach(coord => {
                    lon += coord[0];
                    lat += coord[1];
                });
                lat /= ring.length;
                lon /= ring.length;
                
                console.log(`Adding fire at: ${lat}, ${lon}`);
                
                // Create fire circle
                const fireMarker = L.circle([lat, lon], {
                    color: '#FF0000',
                    fillColor: '#FF4444',
                    fillOpacity: 0.5,
                    radius: 5000
                }).addTo(wildfireMap);

                // Add pulsing marker
                const pulsingIcon = L.divIcon({
                    className: 'pulsing-icon',
                    html: '<div class="pulsing-dot"></div>',
                    iconSize: [20, 20]
                });

                // Add the actual fire perimeter
                const firePerimeter = L.polygon(ring.map(coord => [coord[1], coord[0]]), {
                    color: '#FF0000',
                    weight: 2,
                    fillColor: '#FF4444',
                    fillOpacity: 0.2
                }).addTo(wildfireMap);

                L.marker([lat, lon], { icon: pulsingIcon })
                    .addTo(wildfireMap)
                    .bindPopup(`
                        <div class="fire-popup">
                            <h3>${feature.attributes.IncidentName || 'Active Fire'}</h3>
                            <p><strong>Status:</strong> ${feature.attributes.IncidentStatus || 'Active'}</p>
                            <p><strong>Size:</strong> ${feature.attributes.GISAcres ? Math.round(feature.attributes.GISAcres) + ' acres' : 'N/A'}</p>
                            <p><strong>Started:</strong> ${feature.attributes.CreatedOn ? new Date(feature.attributes.CreatedOn).toLocaleDateString() : 'N/A'}</p>
                            <p><strong>Updated:</strong> ${feature.attributes.ModifiedOn ? new Date(feature.attributes.ModifiedOn).toLocaleDateString() : 'N/A'}</p>
                        </div>
                    `);
            });
        } else {
            console.log('No active fires found');
            document.getElementById('wildfire-map').innerHTML += 
                '<p style="color: green; text-align: center; margin-top: 10px;">No active fires reported in California at this time.</p>';
        }

        // Add legend
        const legend = L.control({position: 'bottomright'});
        legend.onAdd = function(map) {
            const div = L.DomUtil.create('div', 'info legend');
            div.innerHTML = `
                <div class="legend-container">
                    <h4>Active Fires</h4>
                    <div class="legend-item">
                        <span class="pulsing-dot"></span>
                        <span>Fire Location</span>
                    </div>
                    <div class="legend-item">
                        <span class="legend-circle"></span>
                        <span>Fire Area</span>
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

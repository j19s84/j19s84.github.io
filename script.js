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
        // Use CalFire's ArcGIS service
        const url = 'https://services3.arcgis.com/T4QMspbfLg3qTGWY/arcgis/rest/services/Active_Incidents_Public/FeatureServer/0/query?where=1%3D1&outFields=*&outSR=4326&f=json';
        
        const response = await fetch(url);
        if (!response.ok) throw new Error('CalFire API error');
        const data = await response.json();
        
        // Debug log
        console.log('Fire data received:', data);
        
        // Check if data exists and has features
        if (!data || !data.features || !Array.isArray(data.features)) {
            throw new Error('No fire data available');
        }
        
        // Initialize wildfire map
        const wildfireMap = L.map('wildfire-map').setView([lat, lon], 7);
        L.tileLayer('https://{s}.tile.openstreetmap.org/{z}/{x}/{y}.png', {
            attribution: '© OpenStreetMap contributors'
        }).addTo(wildfireMap);

        // Add fire markers
        data.features.forEach(feature => {
            // Debug log for each feature
            console.log('Processing fire:', feature);
            
            const fire = feature.attributes;
            const coords = feature.geometry;
            
            // Skip if no location data
            if (!coords || !coords.y || !coords.x) {
                console.log('Skipping fire due to missing coordinates');
                return;
            }

            // Determine marker color based on containment
            const containment = parseInt(fire.PercentContained) || 0;
            const color = containment > 70 ? '#4CAF50' :  // Green for mostly contained
                         containment > 30 ? '#FFA726' :   // Orange for partially contained
                                          '#FF5252';      // Red for low containment

            // Create marker with custom icon
            const fireIcon = L.divIcon({
                className: 'fire-marker',
                html: `<div style="background-color: ${color};" class="fire-icon"></div>`,
                iconSize: [20, 20]
            });

            L.marker([coords.y, coords.x], { icon: fireIcon })
                .addTo(wildfireMap)
                .bindPopup(`
                    <div class="fire-popup">
                        <h3>${fire.IncidentName || 'Unnamed Fire'}</h3>
                        <p><strong>County:</strong> ${fire.County || 'N/A'}</p>
                        <p><strong>Location:</strong> ${fire.Location || 'N/A'}</p>
                        <p><strong>Acres Burned:</strong> ${fire.AcresBurned || 'N/A'}</p>
                        <p><strong>Containment:</strong> ${fire.PercentContained || '0'}%</p>
                        <p><strong>Updated:</strong> ${new Date(fire.UpdateDate).toLocaleString()}</p>
                        ${fire.ControlStatement ? `<p><strong>Status:</strong> ${fire.ControlStatement}</p>` : ''}
                        <a href="https://www.fire.ca.gov/incidents" target="_blank" class="fire-details-link">View All Incidents</a>
                    </div>
                `);
        });

        // Add legend
        const legend = L.control({position: 'bottomright'});
        legend.onAdd = function(map) {
            const div = L.DomUtil.create('div', 'info legend');
            div.innerHTML = `
                <div class="legend-container">
                    <h4>Fire Containment</h4>
                    <div class="legend-item">
                        <span class="legend-color" style="background: #FF5252"></span>
                        <span>0-30% Contained</span>
                    </div>
                    <div class="legend-item">
                        <span class="legend-color" style="background: #FFA726"></span>
                        <span>31-70% Contained</span>
                    </div>
                    <div class="legend-item">
                        <span class="legend-color" style="background: #4CAF50"></span>
                        <span>71-100% Contained</span>
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

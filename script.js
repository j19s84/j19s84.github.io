// Define functions first
function launchSOSPlan() {
    alert('SOS Plan feature coming soon!');
}

async function fetchWeatherData(lat, lon) {
    const API_KEY = '8224d2b200e0f0663e86aa1f3d1ea740';
    const url = `https://api.openweathermap.org/data/2.5/forecast?lat=${lat}&lon=${lon}&appid=${API_KEY}&units=metric`;
    
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
            const windSpeed = Math.round(day.wind.speed * 2.237);
            const windDir = getWindDirection(day.wind.deg);
            
            const weatherCard = document.createElement('div');
            weatherCard.className = `weather-card weather-${weatherMain}`;
            weatherCard.innerHTML = `
                <div class="weather-date-container">
                    <div class="weather-day">${date.toLocaleDateString('en-US', { weekday: 'short' })}</div>
                    <div class="weather-date">${date.toLocaleDateString('en-US', { month: 'short', day: 'numeric' })}</div>
                </div>
                <img src="https://openweathermap.org/img/wn/${icon}@2x.png" alt="${description}">
                <div class="weather-temp">
                    <span class="temp-f">${tempF}°F</span>
                </div>
                <div class="weather-desc">${description}</div>
                <div class="weather-details">
                    <div class="humidity">💧${humidity}%</div>
                    <div class="wind">🌬️${windSpeed}${windDir}</div>
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
async function fetchWildfireData(lat, lon) {
    try {
        const url = 'https://services9.arcgis.com/RHVPKKiFTONKtxq3/arcgis/rest/services/USA_Wildfires_v1/FeatureServer/0/query?' +
            'where=1%3D1' +
            '&outFields=*' +
            '&geometryType=esriGeometryEnvelope' +
            '&spatialRel=esriSpatialRelIntersects' +
            '&returnGeometry=true' +
            '&f=json';
        
        const response = await fetch(url);
        const data = await response.json();
        
        if (data.error) {
            throw new Error(`API error: ${data.error.message || 'Unknown error'}`);
        }
        
        // Initialize wildfire map centered on user's location
        const wildfireMap = L.map('wildfire-map').setView([lat, lon], 6);
        L.tileLayer('https://{s}.tile.openstreetmap.org/{z}/{x}/{y}.png', {
            attribution: '© OpenStreetMap contributors'
        }).addTo(wildfireMap);

        // Add user location marker with blue color and pulse effect
        const userIcon = L.divIcon({
            className: 'user-location-icon',
            html: `
                <div class="user-location-dot">
                    <div class="user-location-pulse"></div>
                </div>
            `,
            iconSize: [20, 20]
        });

        L.marker([lat, lon], { icon: userIcon })
            .addTo(wildfireMap)
            .bindPopup('Your Location')
            .openPopup();

        if (data.features && data.features.length > 0) {
            data.features.forEach(feature => {
                if (!feature.geometry || !feature.geometry.x || !feature.geometry.y) return;
                
                const props = feature.attributes;
                const fireLat = feature.geometry.y;
                const fireLon = feature.geometry.x;
                
                const discoveryDate = props.FireDiscoveryDateTime ? new Date(props.FireDiscoveryDateTime) : null;
                const isNew = discoveryDate && 
                           ((new Date().getTime() - discoveryDate.getTime()) < (24 * 60 * 60 * 1000));
                
                const acres = parseFloat(props.GISAcres) || 0;
                let color, size;
                
                if (acres > 10000) {
                    color = '#FF0000';
                    size = 30;
                } else if (acres > 1000) {
                    color = '#FFA500';
                    size = 20;
                } else {
                    color = '#FFD700';
                    size = 12;
                }

                const markerHtml = isNew ? 
                    `<div class="pulsing-dot" style="background-color: ${color}; width: ${size}px; height: ${size}px;">
                        <span class="new-fire-indicator">NEW</span>
                    </div>` :
                    `<div style="background-color: ${color}; width: ${size}px; height: ${size}px; border-radius: 50%;"></div>`;

                const fireIcon = L.divIcon({
                    className: 'fire-icon',
                    html: markerHtml,
                    iconSize: [size, size]
                });

                L.marker([fireLat, fireLon], { icon: fireIcon })
                    .addTo(wildfireMap)
                    .bindPopup(`
                        <div class="fire-popup">
                            <h3>${props.IncidentName || 'Active Fire'}</h3>
                            <p><strong>Size:</strong> ${acres ? Math.round(acres).toLocaleString() + ' acres' : 'N/A'}</p>
                            <p><strong>Status:</strong> ${props.IncidentStatus || 'Active'}</p>
                            <p><strong>Type:</strong> ${props.FireType || 'N/A'}</p>
                            <p><strong>State:</strong> ${props.POOState || 'N/A'}</p>
                            <p><strong>Agency:</strong> ${props.POOAgency || 'N/A'}</p>
                            ${isNew ? '<p><strong><span class="new-fire-indicator">NEW</span></strong></p>' : ''}
                        </div>
                    `);
            });

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
                            <span class="legend-color" style="background: #FFA500"></span>
                            <span>Medium (1,000-10,000 acres)</span>
                        </div>
                        <div class="legend-item">
                            <span class="legend-color" style="background: #FFD700"></span>
                            <span>Small (<1,000 acres)</span>
                        </div>
                        <div class="legend-item">
                            <span class="new-fire-indicator-legend">NEW</span>
                            <span>Reported in last 24hrs</span>
                        </div>
                        <div class="legend-item">
                            <span class="legend-color" style="background: #4A90E2"></span>
                            <span>Your Location</span>
                        </div>
                    </div>
                `;
                return div;
            };
            legend.addTo(wildfireMap);
        }

    } catch (error) {
        console.error('Error fetching wildfire data:', error);
        document.getElementById('wildfire-map').innerHTML = 
            '<p>Wildfire data temporarily unavailable. Please try again later.</p>';
    }
}

// Success callback for geolocation
function successLocation(position) {
    const latitude = position.coords.latitude;
    const longitude = position.coords.longitude;
    
    // Display coordinates
    document.getElementById('coordinates').textContent = 
        `Latitude: ${latitude}, Longitude: ${longitude}`;
    
    // Get weather data
    fetchWeatherData(latitude, longitude);
    
    // Get wildfire data and initialize map with user location
    fetchWildfireData(latitude, longitude);
}

// Error callback for geolocation
function errorLocation() {
    alert('Unable to retrieve your location');
    // Initialize map with default US view if location fails
    fetchWildfireData(39.8283, -98.5795);
}

// Initialize maps and get location - MOVED TO THE END
document.addEventListener('DOMContentLoaded', function() {
    // Get user's location
    if (navigator.geolocation) {
        navigator.geolocation.getCurrentPosition(successLocation, errorLocation);
    }

    // Initialize the SOS button
    document.getElementById('sos-button').addEventListener('click', launchSOSPlan);
});

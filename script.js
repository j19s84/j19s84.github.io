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
        // Using NIFC's public fire features service
        const url = 'https://services9.arcgis.com/RHVPKKiFTONKtxq3/arcgis/rest/services/USA_Wildfires_v1/FeatureServer/0/query?' +
            'where=1%3D1' +
            '&outFields=*' +
            '&geometryType=esriGeometryEnvelope' +
            '&spatialRel=esriSpatialRelIntersects' +
            '&returnGeometry=true' +
            '&f=json';
        
        console.log('Fetching from URL:', url);
        
        const response = await fetch(url);
        const data = await response.json();
        
        console.log('Raw response:', data);
        
        if (data.error) {
            throw new Error(`API error: ${data.error.message || 'Unknown error'}`);
        }
        
        // Initialize wildfire map with national view
        const wildfireMap = L.map('wildfire-map').setView([39.8283, -98.5795], 4);
        L.tileLayer('https://{s}.tile.openstreetmap.org/{z}/{x}/{y}.png', {
            attribution: '© OpenStreetMap contributors'
        }).addTo(wildfireMap);

        // Define size categories outside the loop
        const sizeCategories = {
            large: {
                threshold: 10000,
                color: '#FF0000',     // Deep red
                radius: 15000,        // Larger circle
                label: 'Large'
            },
            medium: {
                threshold: 1000,
                color: '#FFA500',     // Orange
                radius: 10000,        // Medium circle
                label: 'Medium'
            },
            small: {
                threshold: 0,
                color: '#FFD700',     // Gold/Yellow
                radius: 5000,         // Smaller circle
                label: 'Small'
            }
        };

        // Inside your fetchWildfireData function, update the fire marker creation:

data.features.forEach(feature => {
    if (!feature.geometry || !feature.geometry.x || !feature.geometry.y) return;
    
    const props = feature.attributes;
    const lat = feature.geometry.y;
    const lon = feature.geometry.x;
    
    // Check if fire is new (within last 24 hours)
    const discoveryDate = props.FireDiscoveryDateTime ? new Date(props.FireDiscoveryDateTime) : null;
    const isNew = discoveryDate && 
                 ((new Date().getTime() - discoveryDate.getTime()) < (24 * 60 * 60 * 1000));
    
    // Determine size and color based on acres
    const acres = props.GISAcres || 0;
    let color, size;
    
    if (acres > 10000) {
        color = '#FF0000'; // Red
        size = 20;
    } else if (acres > 1000) {
        color = '#FFA500'; // Orange
        size = 15;
    } else {
        color = '#FFD700'; // Yellow
        size = 10;
    }

    console.log(`Fire: ${props.IncidentName}, Acres: ${acres}, Color: ${color}, Size: ${size}`);

    // Create pulsing marker
    const pulsingIcon = L.divIcon({
        className: 'pulsing-icon',
        html: `
            <div class="pulsing-dot" style="
                background-color: ${color};
                width: ${size}px;
                height: ${size}px;
            ">
                ${isNew ? '<span class="new-fire-indicator">NEW</span>' : ''}
            </div>
        `,
        iconSize: [size, size]
    });

                L.marker([lat, lon], { icon: pulsingIcon })
                    .addTo(wildfireMap)
                    .bindPopup(`
                        <div class="fire-popup">
                            <h3>${props.IncidentName || 'Active Fire'}</h3>
                            <p><strong>Size:</strong> ${props.GISAcres ? Math.round(props.GISAcres).toLocaleString() + ' acres' : 'N/A'}</p>
                            <p><strong>Status:</strong> ${props.IncidentStatus || 'Active'}</p>
                            <p><strong>Type:</strong> ${props.FireType || 'N/A'}</p>
                            <p><strong>State:</strong> ${props.POOState || 'N/A'}</p>
                            <p><strong>Agency:</strong> ${props.POOAgency || 'N/A'}</p>
                            ${isNew ? '<p><strong><span class="new-fire-indicator">NEW</span></strong></p>' : ''}
                        </div>
                    `);
            });
        } else {
            console.log('No active fires found in the data');
        }

        // Add legend
        const legend = L.control({position: 'bottomright'});
        legend.onAdd = function(map) {
            const div = L.DomUtil.create('div', 'info legend');
            div.innerHTML = `
                <div class="legend-container">
                    <h4>Fire Size</h4>
                    <div class="legend-item">
                        <span class="legend-color" style="background: ${sizeCategories.large.color}"></span>
                        <span>Large (>10,000 acres)</span>
                    </div>
                    <div class="legend-item">
                        <span class="legend-color" style="background: ${sizeCategories.medium.color}"></span>
                        <span>Medium (1,000-10,000 acres)</span>
                    </div>
                    <div class="legend-item">
                        <span class="legend-color" style="background: ${sizeCategories.small.color}"></span>
                        <span>Small (<1,000 acres)</span>
                    </div>
                    <div class="legend-item">
                        <span class="new-fire-indicator-legend">NEW</span>
                        <span>Reported in last 24hrs</span>
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

// Global variables
let wildfireMap;
let userLocationMarker;
let mapLegend;
let currentLocation = {
    lat: null,
    lon: null
};

// Utility functions
const debounce = (func, wait) => {
    let timeout;
    return function executedFunction(...args) {
        const later = () => {
            clearTimeout(timeout);
            func(...args);
        };
        clearTimeout(timeout);
        timeout = setTimeout(later, wait);
    };
};

// Create a debounced version of searchLocation
const debouncedSearch = debounce(searchLocation, 300);

// Initialize when DOM is loaded
document.addEventListener('DOMContentLoaded', function() {
    console.log('DOM loaded');
    if (typeof L === 'undefined') {
        console.error('Leaflet not loaded');
        return;
    }
    console.log('Leaflet loaded');
    
    try {
        wildfireMap = L.map('wildfire-map').setView([39.8283, -98.5795], 4);
        console.log('Map initialized');
        
        L.tileLayer('https://{s}.tile.openstreetmap.org/{z}/{x}/{y}.png', {
            attribution: '© OpenStreetMap contributors'
        }).addTo(wildfireMap);
        console.log('Tile layer added');
    } catch (error) {
        console.error('Map initialization error:', error);
    }

    const sosButton = document.getElementById('sos-button');
    const searchButton = document.getElementById('search-button');
    const locationInput = document.getElementById('location-input');

    // Check if all elements exist
    if (!sosButton || !searchButton || !locationInput) {
        console.error('One or more required elements not found');
        return;
    }

    // Get user location
    if (navigator.geolocation) {
        navigator.geolocation.getCurrentPosition(successLocation, errorLocation);
    }

    // Event listeners
    sosButton.addEventListener('click', launchSOSPlan);
    searchButton.addEventListener('click', debouncedSearch);
    locationInput.addEventListener('keypress', function(e) {
        if (e.key === 'Enter') {
            debouncedSearch();
        }
    });
});

function successLocation(position) {
    const latitude = position.coords.latitude;
    const longitude = position.coords.longitude;
    
    // Update details panel
    const detailsPanel = document.getElementById('fire-details-content');
    if (detailsPanel) {
        detailsPanel.innerHTML = `
            <div class="fire-details-grid">
                <div class="location-title-container">
                    <h2>Current Location</h2>
                    <p class="location-subtitle">Latitude: ${latitude.toFixed(4)}, Longitude: ${longitude.toFixed(4)}</p>
                </div>
            </div>
        `;
    }

    // Fetch all data
    initializeMap(latitude, longitude);
    fetchWeatherData(latitude, longitude);
    fetchWildfireData(latitude, longitude);
    fetchNWSAlerts(latitude, longitude);
}

function errorLocation() {
    console.log('Location access denied, using default location');
    const defaultLat = 39.8283;
    const defaultLon = -98.5795;
    
    initializeMap(defaultLat, defaultLon);
    fetchWeatherData(defaultLat, defaultLon);
    fetchWildfireData(defaultLat, defaultLon);
    fetchNWSAlerts(defaultLat, defaultLon);
}

function initializeMap(lat, lon) {
    console.log('Initializing map with:', lat, lon);
    
    if (!wildfireMap) {
        wildfireMap = L.map('wildfire-map').setView([lat, lon], 6);
        L.tileLayer('https://{s}.tile.openstreetmap.org/{z}/{x}/{y}.png', {
            attribution: '© OpenStreetMap contributors'
        }).addTo(wildfireMap);
        
        // Add the legend when map is first initialized
        addMapLegend();
        isMapInitialized = true;
    } else {
        wildfireMap.setView([lat, lon], 6);
    }

    // Update current location
    currentLocation.lat = lat;
    currentLocation.lon = lon;
    updateLocationDisplay(lat, lon);

    // Add user location marker
    const userIcon = L.divIcon({
        className: 'user-location-icon',
        html: `
            <div class="user-location-dot">
                <div class="user-location-pulse"></div>
            </div>
        `,
        iconSize: [20, 20]
    });

    if (userLocationMarker) {
        userLocationMarker.remove();
    }
    userLocationMarker = L.marker([lat, lon], { icon: userIcon })
        .addTo(wildfireMap)
        .bindPopup('Your Location')
        .openPopup();
}

async function searchLocation() {
    const input = document.getElementById('location-input').value;
    if (!input) return;

    const coordsDisplay = document.getElementById('coordinates');
    if (!coordsDisplay) {
        console.error('Coordinates display element not found');
        return;
    }

    try {
        // First try to match with known fire names
        if (wildfireMap) {
            const foundFire = findFireByName(input);
            if (foundFire) {
                wildfireMap.setView([foundFire.lat, foundFire.lon], 8);
                fetchWeatherData(foundFire.lat, foundFire.lon);
                fetchWildfireData(foundFire.lat, foundFire.lon);
                fetchNWSAlerts(foundFire.lat, foundFire.lon);
                coordsDisplay.textContent = 
                    `Latitude: ${foundFire.lat.toFixed(4)}, Longitude: ${foundFire.lon.toFixed(4)}`;
                return;
            }
        }

        // If no fire found, try regular location search
        const response = await fetch(
            `https://nominatim.openstreetmap.org/search?format=json&q=${encodeURIComponent(input)}&limit=1&countrycodes=us`
        );
        const data = await response.json();

        if (data && data.length > 0) {
            const location = data[0];
            const lat = parseFloat(location.lat);
            const lon = parseFloat(location.lon);

            coordsDisplay.textContent = 
                `Latitude: ${lat.toFixed(4)}, Longitude: ${lon.toFixed(4)}`;

            fetchWeatherData(lat, lon);
            fetchWildfireData(lat, lon);
            fetchNWSAlerts(lat, lon);

            if (wildfireMap) {
                wildfireMap.setView([lat, lon], 8);
            }
        } else {
            alert('Location or fire not found. Please try a different search term.');
        }
    } catch (error) {
        console.error('Error searching location:', error);
        alert('Error searching location. Please try again.');
    }
}

function findFireByName(searchTerm) {
    let foundFire = null;
    searchTerm = searchTerm.toLowerCase();
    
    wildfireMap.eachLayer((layer) => {
        if (layer instanceof L.Marker && layer.getPopup()) {
            const popupContent = layer.getPopup().getContent();
            if (popupContent.toLowerCase().includes(searchTerm)) {
                const latLng = layer.getLatLng();
                foundFire = {
                    lat: latLng.lat,
                    lon: latLng.lng
                };
            }
        }
    });
    
    return foundFire;
}

async function fetchWeatherData(lat, lon) {
    const weatherContainer = document.getElementById('weather-container');
    if (!weatherContainer) {
        console.error('Weather container element not found');
        return;
    }

    weatherContainer.classList.add('loading');
    
    const API_KEY = '8224d2b200e0f0663e86aa1f3d1ea740';
    const url = `https://api.openweathermap.org/data/2.5/forecast?lat=${lat}&lon=${lon}&appid=${API_KEY}&units=metric`;
    
    function getWindDirection(degrees) {
        const directions = ['N', 'NNE', 'NE', 'ENE', 'E', 'ESE', 'SE', 'SSE', 'S', 'SSW', 'SW', 'WSW', 'W', 'WNW', 'NW', 'NNW'];
        const index = Math.round(degrees / 22.5) % 16;
        return directions[index];
    }

    try {
        const response = await fetch(url);
        if (!response.ok) {
            throw new Error('Weather API error: ' + response.status);
        }
        const data = await response.json();
        console.log('Weather data:', data); // Add this for debugging
        
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
        console.error('Weather fetch error:', error);
        weatherContainer.innerHTML = '<p>Weather data temporarily unavailable</p>';
    } finally {
        weatherContainer.classList.remove('loading');
    }
}

async function fetchWildfireData(lat, lon) {
    const mapElement = document.getElementById('wildfire-map');
    mapElement.classList.add('loading');
    
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

        // Clear existing fire markers
        wildfireMap.eachLayer((layer) => {
            if (layer instanceof L.Marker && layer !== userLocationMarker) {
                layer.remove();
            }
        });

        if (data.features && data.features.length > 0) {
            data.features.forEach(feature => {
                if (!feature.geometry || !feature.geometry.x || !feature.geometry.y) return;
                
                const props = feature.attributes;
                const fireLat = feature.geometry.y;
                const fireLon = feature.geometry.x;
                
                const discoveryDate = props.FireDiscoveryDateTime ? new Date(props.FireDiscoveryDateTime) : null;
                const isNew = discoveryDate && 
                    ((new Date().getTime() - discoveryDate.getTime()) < (24 * 60 * 60 * 1000));
                
                const acres = parseFloat(props.DailyAcres) || parseFloat(props.GISAcres) || 0;
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

                const isRx = props.IncidentName?.includes('RX') || props.FireType?.includes('RX');
                const markerHtml = isNew || isRx ?
                    `<div class="pulsing-dot" style="background-color: ${color}; width: ${size}px; height: ${size}px;">
                        ${isNew ? '<span class="new-fire-indicator">NEW</span>' : ''}
                        ${isRx ? '<span class="rx-fire-indicator"><span class="rx-symbol">℞</span></span>' : ''}
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
                        <h3>${props.IncidentName || 'Unnamed Fire'}</h3>
                        <p>Size: ${acres.toLocaleString()} acres</p>
                        <p>Type: ${props.FireType || 'Unknown'}</p>
                        <p>Discovered: ${discoveryDate ? discoveryDate.toLocaleDateString() : 'Unknown'}</p>
                    `);
            });
        }
    } catch (error) {
        console.error('Error fetching wildfire data:', error);
        mapElement.innerHTML = '<p>Wildfire data temporarily unavailable. Please try again later.</p>';
    } finally {
        mapElement.classList.remove('loading');
    }
}

async function fetchNWSAlerts(lat, lon) {
    const alertContainer = document.getElementById('alert-banner');
    if (!alertContainer) {
        console.error('Alert container element not found');
        return;
    }

    alertContainer.classList.add('loading');
    try {
        const pointResponse = await fetch(
            `https://api.weather.gov/points/${lat},${lon}`
        );
        if (!pointResponse.ok) {
            throw new Error('Failed to fetch NWS point data');
        }
        const pointData = await pointResponse.json();
        
        const alertsResponse = await fetch(
            `https://api.weather.gov/alerts/active?point=${lat},${lon}`
        );
        if (!alertsResponse.ok) {
            throw new Error('Failed to fetch alerts');
        }
        const alertsData = await alertsResponse.json();

        if (alertsData.features && alertsData.features.length > 0) {
            const alerts = alertsData.features.sort((a, b) => {
                const severityOrder = ['Extreme', 'Severe', 'Moderate', 'Minor'];
                const severityDiff =
                    severityOrder.indexOf(a.properties.severity) -
                    severityOrder.indexOf(b.properties.severity);
                
                if (severityDiff === 0) {
                    return new Date(b.properties.effective) - new Date(a.properties.effective);
                }
                return severityDiff;
            });

            const alertTags = new Set();
            alerts.forEach(feature => {
                const alert = feature.properties;
                const event = alert.event.toLowerCase();
                const description = alert.description.toLowerCase();
                
                if (event.includes('fire') || event.includes('red flag')) {
                    alertTags.add('🔥 Fire Risk');
                }
                if (event.includes('wind')) {
                    alertTags.add('🌬️ High Winds');
                }
                if (description.includes('humidity') &&
                    (description.includes('low') || description.includes('critical'))) {
                    alertTags.add('💧 Low Humidity');
                }
                if (event.includes('heat')) {
                    alertTags.add('🌡️ Extreme Heat');
                }
                if (event.includes('evacuation')) {
                    alertTags.add('⚠️ Evacuation');
                }
            });

            const tagsHTML = Array.from(alertTags).map(tag =>
                `<span class="alert-tag">${tag}</span>`
            ).join('');

            const alertsHTML = alerts.map(feature => {
                const alert = feature.properties;
                return `
                    <div class="alert-container alert-${alert.severity.toLowerCase()}">
                        <div class="alert-header">
                            <div>
                                <h3>${alert.event}</h3>
                                <span class="alert-timing">
                                    Until ${new Date(alert.expires).toLocaleString()}
                                </span>
                            </div>
                            <span class="expand-icon">▼</span>
                        </div>
                        <div class="alert-content collapsed">
                            <p>${alert.description}</p>
                            ${alert.instruction ? `<p class="alert-instruction">${alert.instruction}</p>` : ''}
                        </div>
                    </div>
                `;
            }).join('');

            alertContainer.innerHTML = `
                <div class="alerts-container">
                    <div class="alert-tags-container">
                        ${tagsHTML}
                    </div>
                    ${alertsHTML}
                </div>
            `;
            
            updateSOSPlans(alertTags);
            setupAlertCollapse();
        } else {
            alertContainer.innerHTML = `
                <div class="alert-none">
                    <p>No active weather alerts for this area</p>
                </div>
            `;
        }
    } catch (error) {
        console.error('Error fetching NWS alerts:', error);
        alertContainer.innerHTML = '<p>Alert data temporarily unavailable</p>';
    } finally {
        alertContainer.classList.remove('loading');
    }
}

function setupAlertCollapse() {
    document.querySelectorAll('.alert-header').forEach(header => {
        header.addEventListener('click', () => {
            const content = header.parentElement.querySelector('.alert-content');
            const icon = header.querySelector('.expand-icon');
            content.classList.toggle('collapsed');
            icon.style.transform = content.classList.contains('collapsed') ?
                'rotate(0deg)' : 'rotate(180deg)';
        });
    });
}

function updateSOSPlans(alertTags) {
    const sosContainer = document.getElementById('evacuation-info');
    if (!sosContainer) return;

    const tags = Array.from(alertTags);
    let sosPlans = [];

    if (tags.includes('🔥 Fire Risk') && tags.includes('🌬️ High Winds')) {
        sosPlans.push({
            status: 'READY',
            type: 'Fire',
            urgency: 'high',
            icon: '🏃'
        });
    }
    if (tags.includes('⚠️ Evacuation')) {
        sosPlans.push({
            status: 'GO',
            type: 'Immediate Evacuation',
            urgency: 'critical',
            icon: '🚨'
        });
    }

    const sosHTML = sosPlans.map(plan => `
        <button class="sos-plan-button sos-${plan.urgency}">
            ${plan.icon} SOS Plan ${plan.status}: ${plan.type}
        </button>
    `).join('');

    sosContainer.innerHTML = `
        <div class="sos-plans">
            ${sosPlans.length ? sosHTML : 'No active evacuation orders'}
        </div>
    `;
}

function launchSOSPlan() {
    alert('SOS Plan feature coming soon!');
}

function calculateFireRisk(lat, lon, alertTags) {
    let riskScore = 0;
    
    if (alertTags.has('🔥 Fire Risk')) riskScore += 2;
    if (alertTags.has('🌬️ High Winds')) riskScore += 1;
    if (alertTags.has('💧 Low Humidity')) riskScore += 1;
    
    let riskLevel = 'LOW';
    if (riskScore >= 4) riskLevel = 'EXTREME';
    else if (riskScore >= 3) riskLevel = 'HIGH';
    else if (riskScore >= 2) riskLevel = 'MODERATE';
    
    return riskLevel;
}

function updateLocationDisplay(lat, lon) {
    const locationDisplay = document.querySelector('.location-subtitle');
    if (locationDisplay) {
        locationDisplay.textContent = `Latitude: ${lat.toFixed(4)}, Longitude: ${lon.toFixed(4)}`;
    }
}

function addMapLegend() {
    if (mapLegend) {
        mapLegend.remove();
    }

    mapLegend = L.control({ position: 'bottomright' });
    mapLegend.onAdd = function() {
        const div = L.DomUtil.create('div', 'legend-container');
        div.innerHTML = `
            <h4>Fire Size</h4>
            <div class="legend-item">
                <span class="legend-color" style="background-color: #FFD700;"></span>
                <span>Small (< 1,000 acres)</span>
            </div>
            <div class="legend-item">
                <span class="legend-color" style="background-color: #FFA500;"></span>
                <span>Medium (1,000-10,000 acres)</span>
            </div>
            <div class="legend-item">
                <span class="legend-color" style="background-color: #FF0000;"></span>
                <span>Large (> 10,000 acres)</span>
            </div>
            <div class="legend-item">
                <span class="rx-fire-indicator-legend">℞</span>
                <span>Prescribed Burn</span>
            </div>
        `;
        return div;
    };
    mapLegend.addTo(wildfireMap);
}

// Add this to track initialization state
let isMapInitialized = false;

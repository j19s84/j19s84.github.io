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
        // Initialize map with US center coordinates
        wildfireMap = L.map('wildfire-map', {
            center: [39.8283, -98.5795],
            zoom: 4,
            dragging: true,      // Enable dragging
            tap: true,           // Enable mobile taps
            trackResize: true,   // Handle window resizing
            boxZoom: true,       // Enable box zooming
            doubleClickZoom: true,
            scrollWheelZoom: true
        });

        // Add the tile layer with proper opacity
        L.tileLayer('https://{s}.tile.openstreetmap.org/{z}/{x}/{y}.png', {
            attribution: '© OpenStreetMap contributors',
            maxZoom: 19,
            opacity: 1.0  // Ensure full opacity
        }).addTo(wildfireMap);

        console.log('Map initialized');

        // Immediately fetch wildfire data
        fetchWildfireData(39.8283, -98.5795);
        
        // Add map legend
        addMapLegend();

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

    // Request location immediately
    if (navigator.geolocation) {
        console.log('Requesting location...');
        navigator.geolocation.getCurrentPosition(
            successLocation,
            errorLocation,
            {
                enableHighAccuracy: true,
                timeout: 5000,
                maximumAge: 0
            }
        );
    } else {
        console.error('Geolocation not supported');
        errorLocation();
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

async function reverseGeocode(lat, lon) {
    try {
        const response = await fetch(
            `https://nominatim.openstreetmap.org/reverse?` +
            `format=json&lat=${lat}&lon=${lon}&zoom=12&addressdetails=1`
        );
        
        if (!response.ok) throw new Error('Geocoding failed');
        
        const data = await response.json();
        console.log('Geocoding response:', data); // Debug log
        
        // Try to get the most relevant name
        const location = data.address;
        return location.city || 
               location.town || 
               location.village || 
               location.hamlet || 
               location.county || 
               'Unknown Location';
        
    } catch (error) {
        console.error('Geocoding error:', error);
        return 'Location Unavailable';
    }
}

function successLocation(position) {
    const latitude = position.coords.latitude;
    const longitude = position.coords.longitude;
    
    // Update map view
    if (wildfireMap) {
        wildfireMap.setView([latitude, longitude], 8);
    }
    
    // Update location display
    const locationInfo = document.createElement('div');
    locationInfo.id = 'coordinates';
    locationInfo.className = 'location-info';
    
    // Get city name and update display
    reverseGeocode(latitude, longitude).then(cityName => {
        locationInfo.innerHTML = `
            <div class="location-details">
                <span class="city-name">${cityName}</span>
                <span class="coordinates">Lat: ${latitude.toFixed(4)}, Lon: ${longitude.toFixed(4)}</span>
            </div>
        `;
        
        // Insert after search bar
        const searchContainer = document.querySelector('.location-search');
        if (searchContainer) {
            searchContainer.insertAdjacentElement('afterend', locationInfo);
        }
    });

    // Fetch data for the new location
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
    try {
        const weatherContainer = document.getElementById('weather-container');
        if (!weatherContainer) return;
        
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
    } catch (error) {
        console.error('Error fetching weather:', error);
    }
}

async function fetchWildfireData(lat, lon) {
    try {
        const mapElement = document.getElementById('wildfire-map');
        mapElement.classList.add('loading');
        
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

                const marker = L.marker([fireLat, fireLon], { icon: fireIcon }).addTo(wildfireMap);
                
                // Add SOS indicator
                addSOSControl(fireLat, fireLon, props);
                
                marker.on('click', function() {
                    const fireDetailsPanel = document.getElementById('fire-details-content');
                    
                    // Format the discovery date
                    const discoveryDate = props.FireDiscoveryDateTime ? 
                        new Date(props.FireDiscoveryDateTime).toLocaleDateString('en-US', {
                            month: 'numeric',
                            day: 'numeric',
                            year: 'numeric',
                            hour: 'numeric',
                            minute: 'numeric'
                        }) : 'Unknown';

                    // Calculate time since discovery
                    let timeSince = '';
                    if (props.FireDiscoveryDateTime) {
                        const hours = Math.floor((new Date() - new Date(props.FireDiscoveryDateTime)) / (1000 * 60 * 60));
                        timeSince = `(${hours} hours ago)`;
                    }

                    // Calculate containment percentage
                    const containment = props.PercentContained || 0;
                    
                    // Get fire cause if available
                    const fireCause = props.FireCause || 'Under Investigation';
                    
                    // Get fire behavior if available
                    const fireBehavior = props.FireBehavior || 'No behavior information available';
                    
                    // Format the fire name
                    const fireName = `${props.IncidentName || 'Unnamed'} Fire`;

                    fireDetailsPanel.innerHTML = `
                        <div class="fire-details-card">
                            <h2 class="fire-name">🔥 ${fireName}</h2>
                            <div class="fire-stats">
                                <div class="stat-group">
                                    <label>Size:</label>
                                    <span>${(acres).toLocaleString()} acres</span>
                                </div>
                                <div class="stat-group">
                                    <label>Type:</label>
                                    <span>${props.FireType || 'Unknown'}</span>
                                </div>
                                <div class="stat-group">
                                    <label>Discovered:</label>
                                    <span>${discoveryDate} ${timeSince}</span>
                                </div>
                                <div class="stat-group">
                                    <label>Containment:</label>
                                    <span>${containment}%</span>
                                </div>
                                <div class="stat-group">
                                    <label>Cause:</label>
                                    <span>${fireCause}</span>
                                </div>
                                <div class="stat-group">
                                    <label>Behavior:</label>
                                    <span>${fireBehavior}</span>
                                </div>
                                <button class="find-safe-routes-btn" onclick="findSafeRoutes(${fireLat}, ${fireLon})">
                                    Find Safe Routes
                                </button>
                            </div>
                        </div>
                    `;
                });
            });
        } else {
            const fireDetailsPanel = document.getElementById('fire-details-content');
            if (fireDetailsPanel) {
                fireDetailsPanel.innerHTML = `
                    <div class="fire-details-card">
                        <h3>No Active Fires</h3>
                        <p>There are currently no active fires reported in this area.</p>
                    </div>
                `;
            }
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
        console.error('Alert container not found');
        return;
    }

    alertContainer.classList.add('loading');
    
    try {
        // First get the NWS grid point for the location
        const pointResponse = await fetch(
            `https://api.weather.gov/points/${lat},${lon}`
        );
        if (!pointResponse.ok) throw new Error('Failed to fetch NWS point data');
        const pointData = await pointResponse.json();

        // Then get active alerts for this location
        const alertsResponse = await fetch(
            `https://api.weather.gov/alerts/active?point=${lat},${lon}`
        );
        if (!alertsResponse.ok) throw new Error('Failed to fetch alerts');
        const alertsData = await alertsResponse.json();

        if (alertsData.features && alertsData.features.length > 0) {
            // Sort alerts by severity
            const alerts = alertsData.features.sort((a, b) => {
                const severityOrder = ['Extreme', 'Severe', 'Moderate', 'Minor'];
                return severityOrder.indexOf(a.properties.severity) - 
                       severityOrder.indexOf(b.properties.severity);
            });

            // Create alert tags for different conditions
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

            // Generate HTML for alert tags and alerts
            const tagsHTML = Array.from(alertTags)
                .map(tag => `<span class="alert-tag">${tag}</span>`)
                .join('');

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
                            ${alert.instruction ? 
                                `<p class="alert-instruction">${alert.instruction}</p>` : 
                                ''}
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

            // Update SOS plans based on alerts
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
        header.addEventListener('click', (e) => {
            e.preventDefault();
            const content = header.parentElement.querySelector('.alert-content');
            const icon = header.querySelector('.expand-icon');
            
            // Toggle just the content
            content.classList.toggle('collapsed');
            icon.style.transform = content.classList.contains('collapsed') ?
                'rotate(0deg)' : 'rotate(180deg)';
            
            // Prevent event from bubbling up
            e.stopPropagation();
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
            <h4>🔥 Fire Size</h4>
            <div class="legend-items">
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
                    <span class="legend-color" style="background-color: #FF4444;"></span>
                    <span>NEW (Last 24 hours)</span>
                </div>
                <div class="legend-item">
                    <span class="rx-legend">℞</span>
                    <span>Prescribed Burn</span>
                </div>
            </div>
        `;
        return div;
    };
    mapLegend.addTo(wildfireMap);
}

// Add this to track initialization state
let isMapInitialized = false;

// Add this after your map initialization
wildfireMap.on('click', function(e) {
    if (e.originalEvent.target.classList.contains('leaflet-container')) {
        const { lat, lng } = e.latlng;
        console.log('Clicked location:', lat, lng);
        
        // Update map center with animation
        wildfireMap.setView([lat, lng], 10, {
            animate: true,
            duration: 0.5
        });
        
        // Update data for new location
        updateLocationData(lat, lng);
    }
});

// Separate function to update all location-based data
async function updateLocationData(lat, lng) {
    try {
        const locationName = await reverseGeocode(lat, lng);
        
        // Update location display
        document.getElementById('coordinates').innerHTML = `
            <div class="location-details">
                <span class="city-name">${locationName}</span>
                <span class="coordinates">Lat: ${lat.toFixed(4)}, Lon: ${lng.toFixed(4)}</span>
            </div>
        `;
        
        // Update current location
        currentLocation = { lat, lon: lng };
        
        // Fetch all data for new location
        await Promise.all([
            fetchWeatherData(lat, lng),
            fetchWildfireData(lat, lng),
            fetchNWSAlerts(lat, lng),
            fetchWeatherForecast(lat, lng)
        ]);
    } catch (error) {
        console.error('Error updating location data:', error);
    }
}

async function findSafeRoutes(fireLat, fireLon) {
    const evacuationService = new EvacuationService();
    const fireLocation = { lat: fireLat, lon: fireLon };
    const userLocation = currentLocation;

    const routes = await evacuationService.findSafeLocations(fireLocation, userLocation);
    
    // Display routes on map
    displayEvacuationRoutes(routes);
}

async function fetchWeatherForecast(lat, lon) {
    const API_KEY = '8224d2b200e0f0663e86aa1f3d1ea740'; // Your OpenWeather API key
    try {
        const response = await fetch(
            `https://api.openweathermap.org/data/2.5/forecast?lat=${lat}&lon=${lon}&appid=${API_KEY}&units=imperial`
        );
        const data = await response.json();
        
        // Group by day
        const dailyForecasts = data.list.reduce((days, forecast) => {
            const date = new Date(forecast.dt * 1000).toLocaleDateString();
            if (!days[date]) {
                days[date] = forecast;
            }
            return days;
        }, {});

        // Create forecast HTML
        const forecastContainer = document.getElementById('weather-forecast');
        if (forecastContainer) {
            forecastContainer.innerHTML = `
                <h3>5-Day Forecast</h3>
                <div class="forecast-grid">
                    ${Object.values(dailyForecasts).slice(0, 5).map(day => `
                        <div class="forecast-day">
                            <div class="forecast-date">
                                ${new Date(day.dt * 1000).toLocaleDateString('en-US', {weekday: 'short', month: 'short', day: 'numeric'})}
                            </div>
                            <img src="https://openweathermap.org/img/wn/${day.weather[0].icon}@2x.png" alt="${day.weather[0].description}">
                            <div class="forecast-temp">
                                ${Math.round(day.main.temp)}°F
                            </div>
                            <div class="forecast-desc">
                                ${day.weather[0].main}
                            </div>
                        </div>
                    `).join('')}
                </div>
            `;
        }
    } catch (error) {
        console.error('Error fetching forecast:', error);
    }
}

function processAlerts(alerts) {
    // First, deduplicate similar alerts
    const uniqueAlerts = deduplicateAlerts(alerts);
    
    // Then process each alert
    return uniqueAlerts.map(alert => {
        const props = alert.properties;
        
        // Extract key information for tags
        const tags = extractAlertTags(props);
        
        // Format the alert
        return formatAlert(props, tags);
    });
}

function deduplicateAlerts(alerts) {
    const alertMap = new Map();
    
    alerts.forEach(alert => {
        const props = alert.properties;
        // Create a key from event type and area
        const key = `${props.event}-${props.areaDesc}`;
        
        if (alertMap.has(key)) {
            const existing = alertMap.get(key);
            // If new alert is more recent, replace old one
            if (new Date(props.sent) > new Date(existing.properties.sent)) {
                alertMap.set(key, alert);
            }
        } else {
            alertMap.set(key, alert);
        }
    });
    
    return Array.from(alertMap.values());
}

function extractAlertTags(props) {
    const tags = new Set();
    
    // Add event type tag
    tags.add(formatEventTag(props.event));
    
    // Add severity tag
    if (props.severity) {
        tags.add(formatSeverityTag(props.severity));
    }
    
    // Add specific condition tags based on content
    const description = props.description.toLowerCase();
    
    // Air Quality specific tags
    if (description.includes('air quality')) {
        if (description.includes('unhealthy')) tags.add('😷 Unhealthy Air');
        if (description.includes('moderate')) tags.add('😐 Moderate Air');
        if (description.includes('hazardous')) tags.add('⚠️ Hazardous Air');
    }
    
    // Fire related tags
    if (description.includes('fire') || description.includes('smoke')) {
        if (description.includes('smoke')) tags.add('💨 Smoke');
        if (description.includes('visibility')) tags.add('👁️ Low Visibility');
    }
    
    // Weather related tags
    if (description.includes('wind')) tags.add('💨 High Winds');
    if (description.includes('heat')) tags.add('🌡️ Extreme Heat');
    if (description.includes('humidity')) tags.add('💧 Low Humidity');
    
    // No-burn specific tags
    if (description.includes('no-burn') || description.includes('burning ban')) {
        tags.add('🚫 No Burning');
    }
    
    return Array.from(tags);
}

function formatEventTag(event) {
    const eventIcons = {
        'Air Quality': '💨',
        'Red Flag': '🚩',
        'Heat': '🌡️',
        'Wind': '🌪️',
        'Fire Weather': '🔥'
    };
    
    const icon = eventIcons[event] || '⚠️';
    return `${icon} ${event}`;
}

function formatSeverityTag(severity) {
    const severityColors = {
        'Extreme': 'var(--danger)',
        'Severe': 'var(--warning)',
        'Moderate': 'var(--caution)',
        'Minor': 'var(--info)'
    };
    
    return `<span class="severity-tag" style="background: ${severityColors[severity]}">${severity}</span>`;
}

function formatAlert(props, tags) {
    const date = new Date(props.sent).toLocaleDateString('en-US', {
        month: 'short',
        day: 'numeric',
        year: 'numeric'
    });
    
    const time = new Date(props.sent).toLocaleTimeString('en-US', {
        hour: 'numeric',
        minute: '2-digit'
    });
    
    return `
        <div class="alert-container alert-${props.severity.toLowerCase()}">
            <div class="alert-header">
                <div class="alert-title">
                    <h3>${props.event}</h3>
                    <span class="alert-timing">Until ${new Date(props.expires).toLocaleString()}</span>
                </div>
                <span class="expand-icon">▼</span>
            </div>
            <div class="alert-tags">
                ${tags.map(tag => `<span class="alert-tag">${tag}</span>`).join('')}
            </div>
            <div class="alert-content collapsed">
                <p>${props.description}</p>
                ${props.instruction ? `<p class="alert-instruction">${props.instruction}</p>` : ''}
            </div>
        </div>
    `;
}

async function showEvacuationRoutes(fireLat, fireLon, fireProps) {
    // Clear existing routes
    if (window.currentRoutes) {
        window.currentRoutes.forEach(route => route.remove());
    }
    window.currentRoutes = [];

    // Find safe locations
    const safeLocations = await findSafeLocations(fireLat, fireLon);
    
    // Sort by distance and take top 3
    const sortedLocations = safeLocations
        .map(loc => ({
            ...loc,
            distance: getDistance(fireLat, fireLon, loc.lat, loc.lon)
        }))
        .sort((a, b) => a.distance - b.distance)
        .slice(0, 3);

    // Calculate routes
    const routes = await Promise.all(
        sortedLocations.map(async location => {
            const route = await calculateRoute(
                { lat: fireLat, lon: fireLon },
                { lat: location.lat, lon: location.lon }
            );
            return {
                ...route,
                destination: location
            };
        })
    );

    // Filter out failed routes
    const validRoutes = routes.filter(r => r !== null);

    // Update the panel with route information
    updateRoutesPanel(validRoutes);

    // Draw routes on map
    validRoutes.forEach((route, index) => {
        const routeLine = L.polyline(route.coordinates, {
            color: ['#00BFA5', '#00B0FF', '#651FFF'][index],
            weight: 5,
            opacity: 0.8,
            className: 'evacuation-route'
        }).addTo(wildfireMap);
        
        // Add destination marker
        const dest = route.destination;
        L.marker([dest.lat, dest.lon], {
            icon: L.divIcon({
                className: 'destination-marker',
                html: `<div class="destination-icon">${getDestinationIcon(dest.type)}</div>`
            })
        }).addTo(wildfireMap);
        
        window.currentRoutes.push(routeLine);
    });
}

function getDestinationIcon(type) {
    const icons = {
        'shelter': '🏘️',
        'school': '🏫',
        'hospital': '🏥',
        'fire_station': '🚒'
    };
    return icons[type] || '🏢';
}

function getDistance(lat1, lon1, lat2, lon2) {
    const R = 6371; // Earth's radius in km
    const dLat = (lat2 - lat1) * Math.PI / 180;
    const dLon = (lon2 - lon1) * Math.PI / 180;
    const a = Math.sin(dLat/2) * Math.sin(dLat/2) +
        Math.cos(lat1 * Math.PI / 180) * Math.cos(lat2 * Math.PI / 180) * 
        Math.sin(dLon/2) * Math.sin(dLon/2);
    const c = 2 * Math.atan2(Math.sqrt(a), Math.sqrt(1-a));
    return R * c;
}

async function findSafeLocations(fireLat, fireLon, radius = 20000) { // radius in meters
    try {
        // Fetch emergency locations from OpenStreetMap
        const query = `
            [out:json][timeout:25];
            (
                way["amenity"="shelter"](around:${radius},${fireLat},${fireLon});
                way["amenity"="school"](around:${radius},${fireLat},${fireLon});
                way["amenity"="hospital"](around:${radius},${fireLat},${fireLon});
                way["amenity"="fire_station"](around:${radius},${fireLat},${fireLon});
            );
            out body;
            >;
            out skel qt;
        `;

        const response = await fetch('https://overpass-api.de/api/interpreter', {
            method: 'POST',
            body: query
        });

        const data = await response.json();
        return data.elements.filter(e => e.tags && e.lat && e.lon).map(e => ({
            type: e.tags.amenity,
            name: e.tags.name || `${e.tags.amenity.charAt(0).toUpperCase() + e.tags.amenity.slice(1)}`,
            lat: e.lat,
            lon: e.lon
        }));
    } catch (error) {
        console.error('Error fetching safe locations:', error);
        return [];
    }
}

async function calculateRoute(start, end) {
    try {
        const response = await fetch(
            `https://router.project-osrm.org/route/v1/driving/` +
            `${start.lon},${start.lat};${end.lon},${end.lat}` +
            `?overview=full&geometries=geojson`
        );
        const data = await response.json();
        
        if (data.routes && data.routes[0]) {
            return {
                coordinates: data.routes[0].geometry.coordinates.map(coord => [coord[1], coord[0]]),
                distance: (data.routes[0].distance / 1609.34).toFixed(1), // Convert to miles
                duration: Math.round(data.routes[0].duration / 60) // Convert to minutes
            };
        }
        throw new Error('No route found');
    } catch (error) {
        console.error('Error calculating route:', error);
        return null;
    }
}

function addSOSControl(fireLat, fireLon, props) {
    const SOSControl = L.Control.extend({
        options: {
            position: 'bottomright'
        },
        onAdd: function(map) {
            const container = L.DomUtil.create('div', 'sos-control');
            container.innerHTML = `
                <button class="sos-button">
                    <span class="pulse-dot"></span>
                    See SOS Plan
                </button>
            `;
            
            container.onclick = () => showEvacuationRoutes(fireLat, fireLon, props);
            return container;
        }
    });
    
    return new SOSControl();
}

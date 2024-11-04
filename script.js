// Move the global wildfireMap declaration to the very top
let wildfireMap;
let userLocationMarker;
let mapLegend;

// Add the debounce function before any other functions
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

    document.addEventListener('DOMContentLoaded', function() {
        const sosButton = document.getElementById('sos-button');
        const searchButton = document.getElementById('search-button');
        const locationInput = document.getElementById('location-input');

          // Check if all elements exist
        if (!sosButton || !searchButton || !locationInput) {
        console.error('One or more required elements not found');
        return;
    }
        
        if (navigator.geolocation) {
        navigator.geolocation.getCurrentPosition(successLocation, errorLocation);
    }

    // All event listeners in one place
    sosButton.addEventListener('click', launchSOSPlan);
    searchButton.addEventListener('click', debouncedSearch);
    locationInput.addEventListener('keypress', function(e) {
        if (e.key === 'Enter') {
            debouncedSearch();
        }
    });
});

function setupAlertCollapse() {
    document.querySelectorAll('.alert-header').forEach(header => {
        header.addEventListener('click', () => {
            const content = header.nextElementSibling;
            const container = header.parentElement;
            
            content.classList.toggle('expanded');
            container.classList.toggle('expanded');
            
            if (content.classList.contains('expanded')) {
                content.scrollIntoView({ behavior: 'smooth', block: 'nearest' });
            }
        });
    });
}

function successLocation(position) {
    const latitude = position.coords.latitude;
    const longitude = position.coords.longitude;
    
    const coordsDisplay = document.getElementById('coordinates');
    document.getElementById('location-title').textContent = 'Current Location';
    document.getElementById('location-subtitle').textContent = 
        `Latitude: ${latitude.toFixed(4)}, Longitude: ${longitude.toFixed(4)}`;
    
    fetchWeatherData(latitude, longitude);
    fetchWildfireData(latitude, longitude);
    fetchNWSAlerts(latitude, longitude);
    fetchNIFCData(latitude, longitude); 
    checkEvacuationOrders(latitude, longitude);
}

function errorLocation() {
    alert('Unable to retrieve your location');
    const defaultLat = 39.8283;
    const defaultLon = -98.5795;
    fetchWildfireData(defaultLat, defaultLon);
    fetchWeatherData(defaultLat, defaultLon);
    fetchNWSAlerts(defaultLat, defaultLon);
    fetchNIFCData(defaultLat, defaultLon);
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
        // First try to match with known fire names from the current data
        if (wildfireMap) {
            const foundFire = findFireByName(input);
            if (foundFire) {
                wildfireMap.setView([foundFire.lat, foundFire.lon], 8);
                // Update all the data for this location
                fetchWeatherData(foundFire.lat, foundFire.lon);
                fetchNWSAlerts(foundFire.lat, foundFire.lon);
                checkEvacuationOrders(foundFire.lat, foundFire.lon);
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

            // Update coordinates display
            coordsDisplay.textContent = 
                `Latitude: ${lat.toFixed(4)}, Longitude: ${lon.toFixed(4)}`;

            // Fetch new data for this location
            fetchWeatherData(lat, lon);
            fetchWildfireData(lat, lon);
            fetchNWSAlerts(lat, lon);
            fetchNIFCData(lat, lon); 
            checkEvacuationOrders(lat, lon);

            // Update map view
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

// Helper function to find fire by name
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
        if (!response.ok) throw new Error('Weather API error');
        const data = await response.json();
        
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
        weatherContainer.innerHTML = 
            '<p>Weather data temporarily unavailable. Please try again later.</p>';
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
        
        if (wildfireMap) {
            wildfireMap.setView([lat, lon], 6);
        } else {
            wildfireMap = L.map('wildfire-map').setView([lat, lon], 6);
            L.tileLayer('https://{s}.tile.openstreetmap.org/{z}/{x}/{y}.png', {
                attribution: '© OpenStreetMap contributors'
            }).addTo(wildfireMap);
        }

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

                const discoveryDateTime = props.FireDiscoveryDateTime ? 
                    new Date(props.FireDiscoveryDateTime).toLocaleString() : 'N/A';
                const lastUpdated = props.ModifiedOnDateTime ? 
                    new Date(props.ModifiedOnDateTime).toLocaleString() : 'N/A';

                L.marker([fireLat, fireLon], { icon: fireIcon })
                    .addTo(wildfireMap)
                    .on('click', async function(e) {
                        const clickedLat = e.latlng.lat;
                        const clickedLon = e.latlng.lng;
                        
                        document.getElementById('coordinates').textContent = 
                            `Latitude: ${clickedLat.toFixed(4)}, Longitude: ${clickedLon.toFixed(4)}`;
                        
                        if (userLocationMarker) {
                            userLocationMarker.remove();
                        }
                        userLocationMarker = L.marker([clickedLat, clickedLon], { icon: userIcon })
                            .addTo(wildfireMap)
                            .bindPopup('Your Location')
                            .openPopup();

                        const nifcData = await fetchNIFCData(clickedLat, clickedLon);
                        const nifcInfo = nifcData ? `
                            <div class="detail-item">
                                <h3>NIFC Information</h3>
                                <p><strong>Complex Name:</strong> ${nifcData.complexName}</p>
                                <p><strong>Incident Type:</strong> ${nifcData.incidentType}</p>
                                <p><strong>Total Personnel:</strong> ${nifcData.totalPersonnel}</p>
                                <p><strong>Fuel Type:</strong> ${nifcData.fuelType}</p>
                            </div>
                        ` : '';
                        
                        const detailsPanel = document.getElementById('fire-details-content');
                        if (!detailsPanel) {
                            console.error('Fire details panel element not found');
                            return;
                        }

                        detailsPanel.innerHTML = `
                            <div class="location-title-container">
                                <h2>${fireName}</h2>
                                <p class="location-subtitle">Latitude: ${clickedLat.toFixed(4)}, Longitude: ${clickedLon.toFixed(4)}</p>
                            </div>
                            <div class="fire-details-grid">
                            <div class="detail-item">
                                <h3>Fire Information</h3>
                                <p><strong>Type:</strong> ${props.FireType || 'N/A'}</p>
                                <p><strong>Size:</strong> ${acres ? Math.round(acres).toLocaleString() + ' acres' : 'N/A'}</p>
                                <p><strong>Containment:</strong> ${props.PercentContained || '0'}%</p>
                            </div>
                            <div class="detail-item">
                                <h3>Timing</h3>
                                <p><strong>Discovered:</strong> ${discoveryDateTime}</p>
                                <p><strong>Last Updated:</strong> ${lastUpdated}</p>
                            </div>
                            <div class="detail-item">
                                <h3>Management</h3>
                                <p><strong>State:</strong> ${props.POOState || 'N/A'}</p>
                                <p><strong>Agency:</strong> ${props.POOAgency || 'N/A'}</p>
                                ${props.IncidentManagementOrganization ? 
                                    `<p><strong>Management:</strong> ${props.IncidentManagementOrganization}</p>` : ''}
                            </div>
                            ${nifcInfo}
                        </div>
                    `;
                        
                        document.getElementById('fire-details-panel').classList.add('active');
                        
                        fetchWeatherData(clickedLat, clickedLon);
                        fetchNWSAlerts(clickedLat, clickedLon);
                        
                        wildfireMap.setView([clickedLat, clickedLon], 8);
                    });
            });

            if (mapLegend) {
                mapLegend.remove();
            }
            mapLegend = L.control({position: 'bottomright'});
            mapLegend.onAdd = function(map) {
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
            mapLegend.addTo(wildfireMap);
        }

    } catch (error) {
        console.error('Error fetching wildfire data:', error);
        document.getElementById('wildfire-map').innerHTML = 
            '<p>Wildfire data temporarily unavailable. Please try again later.</p>';
    } finally {
        mapElement.classList.remove('loading');
    }
}

// Add this function to your script.js
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
        const pointData = await pointResponse.json();
        
        const alertsResponse = await fetch(
            `https://api.weather.gov/alerts/active?point=${lat},${lon}`
        );
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

            const alertsHTML = alerts.map(feature => {
                const alert = feature.properties;
                return `
                    <div class="alert-container alert-${alert.severity.toLowerCase()}">
                        <div class="alert-header">
                            <div>
                                <h3>${alert.event}</h3>
                                <span class="alert-timing">
                                    Effective until ${new Date(alert.expires).toLocaleString()}
                                </span>
                            </div>
                            <span class="expand-icon">▼</span>
                        </div>
                        <div class="alert-content">
                            <div class="alert-details">
                                <div class="alert-what">
                                    <h4>What</h4>
                                    <p>${alert.description}</p>
                                </div>
                                ${alert.instruction ? `
                                    <div class="alert-instructions">
                                        <h4>Instructions</h4>
                                        <p>${alert.instruction}</p>
                                    </div>
                                ` : ''}
                                <div class="alert-where">
                                    <h4>Where</h4>
                                    <p>${alert.areaDesc}</p>
                                </div>
                            </div>
                            <div class="alert-footer">
                                <p>Issued by ${alert.senderName}</p>
                                <p>Event ID: ${alert.id}</p>
                            </div>
                        </div>
                    </div>
                `;
            }).join('');

            alertContainer.innerHTML = `
                <div class="alerts-container">
                    <h2>Active Weather Alerts (${alerts.length})</h2>
                    ${alertsHTML}
                </div>
            `;

            setupAlertCollapse();
        } else {
            alertContainer.innerHTML = `
                <div class="alert-none">
                    <h2>Weather Alerts</h2>
                    <p>No active weather alerts for your area</p>
                </div>
            `;
        }
    } catch (error) {
        console.error('Error fetching NWS alerts:', error);
        alertContainer.innerHTML = `
            <div class="alert-error">
                <h2>Weather Alerts</h2>
                <p>Unable to fetch weather alerts. Please try again later.</p>
            </div>
        `;
    } finally {
        alertContainer.classList.remove('loading');
    }
}

async function fetchNIFCData(lat, lon) {
    try {
        const nifcUrl = 'https://services3.arcgis.com/T4QMspbfLg3qTGWY/arcgis/rest/services/Active_Fires/FeatureServer/0/query?' +
            'where=1%3D1' +
            '&outFields=*' +
            '&geometryType=esriGeometryEnvelope' +
            '&spatialRel=esriSpatialRelIntersects' +
            '&returnGeometry=true' +
            '&f=json';

        const response = await fetch(nifcUrl);
        const data = await response.json();

        if (data.features) {
            // Find the closest fire to the given coordinates
            let closestFire = null;
            let minDistance = Infinity;

            data.features.forEach(feature => {
                if (!feature.geometry || !feature.geometry.x || !feature.geometry.y) return;

                const fireLat = feature.geometry.y;
                const fireLon = feature.geometry.x;
                
                // Calculate distance to this fire
                const distance = Math.sqrt(
                    Math.pow(fireLat - lat, 2) + 
                    Math.pow(fireLon - lon, 2)
                );

                if (distance < minDistance) {
                    minDistance = distance;
                    closestFire = feature;
                }
            });

            if (closestFire) {
                const props = closestFire.attributes;
                return {
                    complexName: props.ComplexName || 'N/A',
                    incidentType: props.IncidentType || 'N/A',
                    totalPersonnel: props.TotalIncidentPersonnel || 'N/A',
                    fuelType: props.PrimaryFuelType || 'N/A'
                };
            }
        }
        return null;
    } catch (error) {
        console.error('Error fetching NIFC data:', error);
        return null;
    }
}

async function checkEvacuationOrders(lat, lon) {
    try {
        const response = await fetch(
            `https://api.weather.gov/alerts/active?point=${lat},${lon}`
        );
        const data = await response.json();
        
        const evacuationAlerts = data.features?.filter(feature => {
            const event = feature.properties.event.toLowerCase();
            return event.includes('evacuation') || 
                   event.includes('shelter in place') ||
                   event.includes('civil danger');
        });
        
        const evacuationContainer = document.getElementById('evacuation-info');
        if (evacuationAlerts && evacuationAlerts.length > 0) {
            const alertsHTML = evacuationAlerts.map(alert => `
                <div class="evacuation-alert">
                    <h3>${alert.properties.event}</h3>
                    <p>${alert.properties.description}</p>
                    <p><strong>Area:</strong> ${alert.properties.areaDesc}</p>
                </div>
            `).join('');
            
            evacuationContainer.innerHTML = alertsHTML;
        } else {
            evacuationContainer.innerHTML = 'No current evacuation orders';
        }
    } catch (error) {
        console.error('Error checking evacuation orders:', error);
    }
}

function launchSOSPlan() {
    alert('SOS Plan feature coming soon!');
}

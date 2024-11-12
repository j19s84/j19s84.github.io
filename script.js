// Global variables
let wildfireMap;
let userLocationMarker;
let mapLegend;

// Add these at the top with your other global variables
const STORED_LAT = 'lastLatitude';
const STORED_LON = 'lastLongitude';


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


document.addEventListener('DOMContentLoaded', function () {
    const sosButton = document.getElementById('sos-button');
    const searchButton = document.getElementById('search-button');
    const locationInput = document.getElementById('location-input');


    // Check if all elements exist
    if (!sosButton || !searchButton || !locationInput) {
        console.error('One or more required elements not found');
        return;
    }

    // Check for stored coordinates first
    const storedLat = localStorage.getItem(STORED_LAT);
    const storedLon = localStorage.getItem(STORED_LON);
    
    if (storedLat && storedLon) {
        // Use stored coordinates
        successLocation({ coords: { latitude: parseFloat(storedLat), longitude: parseFloat(storedLon) }});
    } else if (navigator.geolocation) {
        navigator.geolocation.getCurrentPosition(successLocation, errorLocation);
    }


    // All event listeners in one place
    sosButton.addEventListener('click', launchSOSPlan);
    searchButton.addEventListener('click', debouncedSearch);
    locationInput.addEventListener('keypress', function (e) {
        if (e.key === 'Enter') {
            debouncedSearch();
        }
    });
});


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


function successLocation(position) {
    const latitude = position.coords.latitude;
    const longitude = position.coords.longitude;
    
    // Store the location
    localStorage.setItem(STORED_LAT, latitude);
    localStorage.setItem(STORED_LON, longitude);
    
    console.log('Location success:', latitude, longitude);

    // Update the fire-details-content panel
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

    // Call APIs with proper error handling
    Promise.all([
        fetchWeatherData(latitude, longitude).catch(err => console.error('Weather error:', err)),
        fetchWildfireData(latitude, longitude).catch(err => console.error('Wildfire error:', err)),
        fetchNWSAlerts(latitude, longitude).catch(err => console.error('NWS error:', err)),
        fetchNIFCData(latitude, longitude).catch(err => console.error('NIFC error:', err))
    ]).catch(err => console.error('Error in API calls:', err));
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
                fetchWeatherData(foundFire.lat, foundFire.lon);
                fetchWildfireData(foundFire.lat, foundFire.lon);
                fetchNWSAlerts(foundFire.lat, foundFire.lon);
                fetchNIFCData(foundFire.lat, foundFire.lon);
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
            fetchNIFCData(lat, lon);


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

    try {
        const API_KEY = '8224d2b200e0f0663e86aa1f3d1ea740';
        if (!API_KEY) {
            console.error('Weather API key is missing');
            return;
        }

        const url = `https://api.openweathermap.org/data/2.5/forecast?lat=${lat}&lon=${lon}&appid=${API_KEY}&units=imperial`;

        const response = await fetch(url);
        if (!response.ok) throw new Error(`Weather API error: ${response.status}`);
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
            const tempF = Math.round(day.main.temp);
            const description = day.weather[0].description;
            const icon = day.weather[0].icon;
            const weatherMain = day.weather[0].main.toLowerCase();
            const humidity = day.main.humidity;
            const windSpeed = Math.round(day.wind.speed);
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
        weatherContainer.innerHTML = '<p>Weather data temporarily unavailable. Please try again later.</p>';
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
                    .on('click', async function (e) {
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

                        let fireName = props.IncidentName || 'Active Fire';
                        if (!fireName.toLowerCase().includes('fire')) {
                            if (fireName.includes('RX') || fireName.includes('Rx')) {
                                fireName = fireName.replace(/\s*RX\s*$/i, ' Fire Rx');
                            } else {
                                fireName += ' Fire';
                            }
                        }

                        detailsPanel.innerHTML = `
                            <div class="location-title-container">
                                <h2>${fireName} 🔥</h2>
                                <p class="location-subtitle">Latitude: ${clickedLat.toFixed(4)}, Longitude: ${clickedLon.toFixed(4)}</p>
                            </div>
                            
                            <div class="fire-details-grid">
                                <div class="detail-item fire-info-card">
                                    <h3>Fire Details</h3>
                                    <div class="fire-info-grid">
                                        <div class="fire-stat">
                                            <span class="stat-label">🏷️ Type</span>
                                            <span class="stat-value">${props.FireType || 'N/A'}</span>
                                        </div>
                                        <div class="fire-stat">
                                            <span class="stat-label">📏 Size</span>
                                            <span class="stat-value">${acres ? Math.round(acres).toLocaleString() + ' acres' : 'N/A'}</span>
                                        </div>
                                        <div class="fire-stat">
                                            <span class="stat-label">🎯 Containment</span>
                                            <span class="stat-value">${props.PercentContained || '0'}%</span>
                                        </div>
                                        <div class="fire-stat">
                                            <span class="stat-label">⏰ Discovered</span>
                                            <span class="stat-value">${discoveryDateTime}</span>
                                        </div>
                                        <div class="fire-stat">
                                            <span class="stat-label">🔄 Last Updated</span>
                                            <span class="stat-value">${lastUpdated}</span>
                                        </div>
                                        <div class="fire-stat">
                                            <span class="stat-label">🏛️ State</span>
                                            <span class="stat-value">${props.POOState || 'N/A'}</span>
                                        </div>
                                        <div class="fire-stat">
                                            <span class="stat-label">👥 Agency</span>
                                            <span class="stat-value">${props.POOAgency || 'N/A'}</span>
                                        </div>
                                        ${props.IncidentManagementOrganization ? `
                                            <div class="fire-stat">
                                                <span class="stat-label">⚡ Management</span>
                                                <span class="stat-value">${props.IncidentManagementOrganization}</span>
                                            </div>
                                        ` : ''}
                                    </div>
                                </div>
                                ${nifcInfo}
                            </div>
                        `;

                        document.getElementById('fire-details-panel').classList.add('active');

                        fetchWeatherData(clickedLat, clickedLon);
                        wildfireMap.setView([clickedLat, clickedLon], 8);
                    });
            });
            if (mapLegend) {
                mapLegend.remove();
            }
            mapLegend = L.control({ position: 'bottomright' });
            mapLegend.onAdd = function (map) {
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

// Add getWindDirection function here
function getWindDirection(degrees) {
    const directions = ['N', 'NNE', 'NE', 'ENE', 'E', 'ESE', 'SE', 'SSE', 'S', 'SSW', 'SW', 'WSW', 'W', 'WNW', 'NW', 'NNW'];
    const index = Math.round(degrees / 22.5) % 16;
    return directions[index];
}

async function fetchNWSAlerts(lat, lon) {
    const alertContainer = document.getElementById('alert-banner');
    if (!alertContainer) {
        console.error('Alert container element not found');
        return;
    }

    const headers = {
        'User-Agent': '(2Safety Weather App, contact@2safety.com)',
        'Accept': 'application/geo+json'
    };

    try {
        // First get the grid data
        const pointResponse = await fetch(
            `https://api.weather.gov/points/${lat.toFixed(4)},${lon.toFixed(4)}`,
            { headers }
        );

        if (!pointResponse.ok) {
            throw new Error(`NWS Points API error: ${pointResponse.status}`);
        }

        const pointData = await pointResponse.json();
        
        // Get the county/zone from the point data
        const zoneResponse = await fetch(pointData.properties.forecastZone, { headers });
        if (!zoneResponse.ok) {
            throw new Error(`NWS Zone API error: ${zoneResponse.status}`);
        }
        const zoneData = await zoneResponse.json();

        // Get alerts for the specific zone
        const alertsResponse = await fetch(
            `https://api.weather.gov/alerts/active/zone/${zoneData.properties.id}`,
            { headers }
        );

        if (!alertsResponse.ok) {
            throw new Error(`NWS Alerts API error: ${alertsResponse.status}`);
        }

        const alertsData = await alertsResponse.json();

        // Rest of your existing alert processing code...
        if (alertsData.features && alertsData.features.length > 0) {
            // Your existing alert processing code...
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
                <p>Unable to fetch weather alerts: ${error.message}</p>
            </div>
        `;
    }
}
function generateAlertTags(properties) {
    const tags = [];
    
    if (properties.event) {
        tags.push(`<span class="alert-tag">${properties.event}</span>`);
    }
    
    if (properties.urgency) {
        tags.push(`<span class="alert-tag">${properties.urgency}</span>`);
    }

    if (properties.severity) {
        tags.push(`<span class="alert-tag">${properties.severity}</span>`);
    }

    return tags.join('');
}

function toggleAlert(header) {
    const content = header.nextElementSibling;
    content.classList.toggle('collapsed');
    const icon = header.querySelector('.expand-icon');
    icon.style.transform = content.classList.contains('collapsed') ? 'rotate(180deg)' : '';
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

    sosContainer.innerHTML = sosPlans.length ? sosHTML : 'No active evacuation orders';
}

function launchSOSPlan() {
    alert('SOS Plan feature coming soon!');
}

// Add this function if it's missing
async function fetchNIFCData(lat, lon) {
    // Placeholder function - can be enhanced later
    return {
        complexName: 'N/A',
        incidentType: 'N/A',
        totalPersonnel: 'N/A',
        fuelType: 'N/A'
    };
}

function updateLocation(lat, lon) {
    // Update coordinates display
    const coordsElement = document.getElementById('coordinates');
    if (coordsElement) {
        coordsElement.textContent = `Latitude: ${lat.toFixed(4)}, Longitude: ${lon.toFixed(4)}`;
    }

    // Fetch weather alerts for the new location
    fetchNWSAlerts(lat, lon);
    
    // Update map view (fixed variable name)
    if (wildfireMap) {
        wildfireMap.setView([lat, lon], 10);
    }
}
// Add this function near your other utility functions
async function calculateFireRisk(lat, lon, alertTags) {
    // Add loading state at the start
    const riskIndicator = document.getElementById('risk-indicator');
    if (riskIndicator) {
        riskIndicator.textContent = 'Calculating risk...';
    }

    let riskScore = 0;

    // Check if in urban area
    const urbanArea = await fetchUrbanArea(lat, lon);
    const isUrban = urbanArea !== null;

    // Adjust risk based on alerts (using higher weights from suggested version)
    if (alertTags.has('🔥 Fire Risk')) riskScore += 3;
    if (alertTags.has('🌬️ High Winds')) riskScore += 2;
    if (alertTags.has('💧 Low Humidity')) riskScore += 2;
    if (alertTags.has('🌡️ Extreme Heat')) riskScore += 2;
    if (alertTags.has('⚠️ Evacuation')) riskScore += 5;

    // Urban areas may have different risk levels
    if (isUrban) {
        riskScore -= 1; // Reduce risk for urban areas
    }

    // Determine risk level (using higher thresholds)
    let riskLevel = 'LOW';
    if (riskScore >= 8) riskLevel = 'EXTREME';
    else if (riskScore >= 5) riskLevel = 'HIGH';
    else if (riskScore >= 3) riskLevel = 'MODERATE';

    // Update risk indicator with final result
    if (riskIndicator) {
        riskIndicator.textContent = `Risk Level: ${riskLevel}`;
        riskIndicator.className = `risk-indicator risk-${riskLevel.toLowerCase()}`;
    }

    console.log('Calculated Risk Level:', riskLevel); 
    return riskLevel;
}

async function fetchUrbanArea(lat, lon) {
    try {
        const response = await fetch(`https://api.teleport.org/api/locations/${lat},${lon}/`);
        const data = await response.json();
        return data._embedded?.['location:nearest-urban-areas'] || null;
    } catch (error) {
        console.error('Error fetching urban area:', error);
        return null;
    }
}
// Add this as the last function in your file
function cleanupMapMarkers() {
    if (wildfireMap) {
        wildfireMap.eachLayer((layer) => {
            if (layer instanceof L.Marker) {
                layer.remove();
            }
        });
    }
}

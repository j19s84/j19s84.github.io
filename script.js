// Global variables
let wildfireMap;
let userLocationMarker;
let mapLegend;


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
  
   // Update only the fire-details-content panel
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
  
   fetchWeatherData(latitude, longitude);
   fetchWildfireData(latitude, longitude);
   fetchNWSAlerts(latitude, longitude);
   fetchNIFCData(latitude, longitude);
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

        console.log('Alerts Data:', alertsData); // Log the alerts data
        console.log('Alerts Features:', alertsData.features); // Log the features array

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
                console.log('Processing Alert:', alert); // Log each alert being processed
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

            const riskLevel = await calculateFireRisk(lat, lon, alertTags); // Await the function
            const riskHTML = `
                <span class="alert-tag risk-level risk-${riskLevel.toLowerCase()}">
                    🎯 Personal Risk: ${riskLevel}
                </span>
            `;

            // Inside the fetchNWSAlerts function or wherever this code is located
const alertsHTML = alerts.map(feature => {
    const alert = feature.properties;
    const summary = alert.headline || 
        `${alert.event} in effect for ${alert.areaDesc} until ${new Date(alert.expires).toLocaleString()}`;
    
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
            <div class="alert-summary">
                ${summary}
            </div>
            <div class="alert-content collapsed">
                <div class="alert-source">
                    <p>Source: <a href="${alert.id}" target="_blank">National Weather Service</a></p>
                    <p>Issued by ${alert.senderName}</p>
                </div>
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
                        <p>${alert.areaDesc}</p> <!-- Ensure this is closed properly -->
                    </div>
                </div>
            </div>
        </div>
    `;
}).join('');

alertContainer.innerHTML = `
                <div class="alerts-container">
                    <div class="alert-tags-container">
                        ${tagsHTML}
                        ${riskHTML}
                    </div>
                    ${alertsHTML}
                </div>
            `;
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
                <p>Unable to fetch weather alerts. Please try again later.</p>
            </div>
        `;
    } finally {
        alertContainer.classList.remove('loading');
    }
}

// After closing the HTML block, you can define your function
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

    sosContainer.innerHTML = `
        <div class="sos-plans">
            ${sosPlans.length ? sosHTML : 'No active evacuation orders'}
        </div>
    `;
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

// Add this function near your other utility functions
async function calculateFireRisk(lat, lon, alertTags) {
    let riskScore = 0;

    // Check if in urban area
    const urbanArea = await fetchUrbanArea(lat, lon);
    const isUrban = urbanArea !== null;

    // Adjust risk based on alerts
    if (alertTags.has('🔥 Fire Risk')) riskScore += 2;
    if (alertTags.has('🌬️ High Winds')) riskScore += 1;
    if (alertTags.has('💧 Low Humidity')) riskScore += 1;

    // Urban areas may have different risk levels
    if (isUrban) {
        riskScore -= 1; // Reduce risk for urban areas
    }

    // Determine risk level
    let riskLevel = 'LOW';
    if (riskScore >= 4) riskLevel = 'EXTREME';
    else if (riskScore >= 3) riskLevel = 'HIGH';
    else if (riskScore >= 2) riskLevel = 'MODERATE';

    console.log('Calculated Risk Level:', riskLevel); // Log the risk level
    return riskLevel; // Ensure this is a string
}


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

// Add back the fetchWildfireData function
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

// Keep your existing fetchWeatherData and launchSOSPlan functions

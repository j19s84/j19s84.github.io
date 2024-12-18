// Global variables
let wildfireMap;
let userLocationMarker;
let mapLegend;
let currentRiskLevel = 'LOW';
let currentLocation = null;

// Add these at the top with your other global variables
const STORED_LAT = 'lastLatitude';
const STORED_LON = 'lastLongitude';

// Emergency facilities configuration
const emergencyFacilities = {
    SHELTER: 'amenity=shelter',
    FIRE_STATION: 'amenity=fire_station',
    HOSPITAL: 'amenity=hospital',
    EVACUATION_POINT: 'emergency=evacuation_point',
    ASSEMBLY_POINT: 'emergency=assembly_point'
};

// User profile structure
const userProfileAttributes = {
    passive: {
        location: null,
        urbanDensity: null,
        nearestFacilities: [],
        currentRisks: [],
        weatherConditions: []
    },
    active: {
        household: {
            adults: null,
            minors: null,
            seniors: null,
            pets: {
                dogs: null,
                cats: null,
                other: null
            }
        },
        transportation: {
            hasVehicle: null,
            vehicleType: null,
            fuelRange: null
        },
        medical: {
            hasDisabilities: null,
            requiresAssistance: null,
            medications: null
        },
        evacuation: {
            predefinedLocation: null,
            maxTravelDistance: null
        }
    }
};
// Define userIcon globally
const userIcon = L.divIcon({
    className: 'user-location-icon',
    html: `
        <div class="user-location-dot">
            <div class="user-location-pulse"></div>
        </div>
    `,
    iconSize: [20, 20]
});
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

function calculateDistance(lat1, lon1, lat2, lon2) {
    const R = 6371; // Earth's radius in km
    const dLat = (lat2 - lat1) * Math.PI / 180;
    const dLon = (lon2 - lon1) * Math.PI / 180;
    const a = 
        Math.sin(dLat/2) * Math.sin(dLat/2) +
        Math.cos(lat1 * Math.PI / 180) * Math.cos(lat2 * Math.PI / 180) * 
        Math.sin(dLon/2) * Math.sin(dLon/2);
    const c = 2 * Math.atan2(Math.sqrt(a), Math.sqrt(1-a));
    return R * c;
}

function calculateBoundingBox(lat, lon, radiusKm) {
    const latChange = (radiusKm / 111.32); // 1 degree = 111.32km
    const lonChange = (radiusKm / (111.32 * Math.cos(lat * Math.PI / 180)));
    return `${lat - latChange},${lon - lonChange},${lat + latChange},${lon + lonChange}`;
}
function createEvacuationZones(fireLat, fireLon, acres) {
    const baseRadius = Math.sqrt(acres) * 100;
    const dangerRadius = Math.max(baseRadius, 5000);
    const warningRadius = dangerRadius * 2;

    const dangerZone = L.circle([fireLat, fireLon], {
        color: 'red',
        fillColor: '#f03',
        fillOpacity: 0.15,
        radius: dangerRadius
    }).addTo(wildfireMap);

    const warningZone = L.circle([fireLat, fireLon], {
        color: 'orange',
        fillColor: '#ff0',
        fillOpacity: 0.1,
        radius: warningRadius
    }).addTo(wildfireMap);

    return { dangerZone, warningZone };
}

function updateRiskLevel(level) {
    const riskIndicator = document.getElementById('risk-indicator');
    if (riskIndicator) {
        riskIndicator.textContent = `Risk Level: ${level}`;
        riskIndicator.className = `risk-indicator risk-${level.toLowerCase()}`;
    }
}

async function findSafeEvacuationPoints(startLat, startLon, fireLocation) {
    const bbox = calculateBoundingBox(startLat, startLon, 50);

    try {
        const response = await fetch('https://overpass-api.de/api/interpreter', {
            method: 'POST',
            body: `[out:json][timeout:25];(
                node["amenity"="shelter"](${bbox});
                node["emergency"="assembly_point"](${bbox});
                node["amenity"="hospital"](${bbox});
            );out body;>;out skel qt;`
        });

        const data = await response.json();
        
        return data.elements
            .filter(element => {
                const distance = calculateDistance(
                    fireLocation.lat,
                    fireLocation.lon,
                    element.lat,
                    element.lon
                );
                return distance > 20;
            })
            .map(element => ({
                type: element.tags.amenity || element.tags.emergency,
                name: element.tags.name || 'Emergency Facility',
                lat: element.lat,
                lon: element.lon
            }));
    } catch (error) {
        console.error('Error fetching safe points:', error);
        return [];
    }
}

async function fetchRoute(startLat, startLon, endLat, endLon) {
    try {
        const response = await fetch(
            `https://router.project-osrm.org/route/v1/driving/` +
            `${startLon},${startLat};${endLon},${endLat}` +
            `?overview=full&geometries=geojson`
        );
        const data = await response.json();
        return data.routes[0];
    } catch (error) {
        console.error('Error fetching route:', error);
        return null;
    }
}

function drawRoute(route, color) {
    if (!route || !route.geometry) return;

    const routeLine = L.geoJSON(route.geometry, {
        style: {
            color: color,
            weight: 4,
            opacity: 0.7
        }
    }).addTo(wildfireMap);

    route.line = routeLine; // Store reference to the layer
    return routeLine;
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

        console.log('Wildfire API response:', {
            status: response.status,
            featureCount: data.features?.length || 0
        });

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

            const trafficLayer = L.tileLayer('https://{s}.api.tomtom.com/traffic/map/4/tile/flow/absolute/{z}/{x}/{y}.png?key=i9vOVwZL7OOMyuoMyZUWSYiGvsFq9NNV', {
                maxZoom: 18,
                opacity: 0.6
            }).addTo(wildfireMap);
        }
        
        // Process wildfire features
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
                        
                        currentRiskLevel = 'HIGH';  // Update global risk level
                        // Update the details panel
                        const detailsPanel = document.getElementById('fire-details-content');
                        if (detailsPanel) {
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
                                </div>
                            `;

                            const zones = createEvacuationZones(fireLat, fireLon, acres);

                            // Find evacuation routes
                            findEvacuationRoutes(clickedLat, clickedLon, { lat: fireLat, lon: fireLon })
                                .then(routes => {
                                    if (routes.length > 0) {
                                        detailsPanel.innerHTML += `
                                            <div class="evacuation-routes">
                                                <h3>🚗 Evacuation Routes</h3>
                                                ${routes.map((route, index) => `
                                                    <div class="route-option">
                                                        <strong>Option ${index + 1}:</strong> 
                                                        To ${route.destination.name}
                                                        (${Math.round(route.distance / 1609.34)}mi, 
                                                        ~${Math.round(route.duration / 60)} mins)
                                                           <br>
                                                        <small>
                                                            <a href="https://www.openstreetmap.org/?mlat=${route.destination.lat}&mlon=${route.destination.lon}" 
                                                                target="_blank" 
                                                                rel="noopener noreferrer">
                                                                View on OpenStreetMap 🔗
                                                            </a>
                                                        </small>
                                                    </div>
                                                `).join('')}
                                            </div>
                                        `;

                                        // Add click handlers for route options
                                        document.querySelectorAll('.route-option').forEach((option, index) => {
                                            option.addEventListener('click', () => {
                                               
                                                document.querySelectorAll('.route-option').forEach(opt => 
                                                    opt.classList.remove('active'));
                                                
                                                // Highlight this option and route
                                                option.classList.add('active');
                                                if (routes[index].line) {
                                                    routes[index].line.setStyle({
                                                        weight: 6,
                                                        opacity: 1
                                                    });
                                                }
                                            });
                                        });
                                    }
                                });

                            document.getElementById('fire-details-panel').classList.add('active');
                        }

                        // Update location marker
                        if (userLocationMarker) {
                            userLocationMarker.remove();
                        }
                        userLocationMarker = L.marker([clickedLat, clickedLon], { icon: userIcon })
                            .addTo(wildfireMap)
                            .bindPopup('Your Location')
                            .openPopup();

                        const fireRisk = {
                            score: 10,
                            level: 'EXTREME',
                            tags: ['🔥 Active Fire']
                        };

                        currentRiskLevel = 'EXTREME';
                        currentLocation = {
                            lat: clickedLat,
                            lon: clickedLon,
                            name: props.IncidentName
                        };

                        updateRiskLevel(fireRisk.level);

                        // Fetch all updated data
                        (async () => {
                            await Promise.all([
                                fetchWeatherData(clickedLat, clickedLon),
                                fetchNWSAlerts(clickedLat, clickedLon),
                                fetchNIFCData(clickedLat, clickedLon)
                            ]).catch(err => console.error('Error updating data:', err));

                        })();

                        updateLocation(clickedLat, clickedLon);
                    });
            });
        }
    } catch (error) {
        console.error('Error fetching wildfire data:', error);
        mapElement.classList.remove('loading');
        throw error;
    }
    mapElement.classList.remove('loading');
}

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
        successLocation({ coords: { latitude: parseFloat(storedLat), longitude: parseFloat(storedLon) } });
    } else if (navigator.geolocation) {
        navigator.geolocation.getCurrentPosition(successLocation, errorLocation);
    }


    // All event listeners in one place
sosButton.addEventListener('click', launchSOSPlan);
searchButton.addEventListener('click', searchLocation);  // <- Changed
locationInput.addEventListener('keypress', function (e) {
    if (e.key === 'Enter') {
        searchLocation();  // <- Changed
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

async function findEvacuationRoutes(startLat, startLon, fireLocation) {
    try {
        // Clear existing routes
        wildfireMap.eachLayer((layer) => {
            if (layer instanceof L.GeoJSON) {
                layer.remove();
            }
        });

        // Get safe points
        const safePoints = await findSafeEvacuationPoints(startLat, startLon, fireLocation);
        
        if (safePoints.length === 0) {
            console.warn('No safe evacuation points found');
            return [];
        }

        // Create new router instance
        const router = new EvacuationRouter(userProfile);

        // Get routes to the closest safe points
        const routes = await Promise.all(safePoints.slice(0, 3).map(async point => {
            const route = await fetchRoute(startLat, startLon, point.lat, point.lon);
            
            if (!route) return null;

            return {
                ...route,
                destination: point,
                distance: route.distance || 0,
                congestion: 0,  // Default value for now
                surface: 'paved',  // Default value
                terrain: 'normal', // Default value
                elevation_gain: 0  // Default value
            };
        }));

        // Filter out null routes
        const validRoutes = routes.filter(route => route !== null);

        // Get optimal routes using the router
        const optimalRoutes = await router.findOptimalRoute(
            { lat: startLat, lon: startLon },
            validRoutes
        );

        // Draw routes on map with explanations
        optimalRoutes.forEach((route, index) => {
            const colors = ['#2ecc71', '#3498db', '#9b59b6'];
            
            // Draw the route line
            const routeLine = L.geoJSON(route.geometry, {
                style: {
                    color: colors[index],
                    weight: 4,
                    opacity: 0.7
                }
            }).addTo(wildfireMap);

            // Add destination marker
            const destination = route.destination;
            const markerIcon = L.divIcon({
                className: 'destination-marker-' + destination.type,
                html: '<div class="marker-icon ' + destination.type + '">' +
                      (destination.type === 'hospital' ? 'H' : 
                       destination.type === 'shelter' ? 'S' : 
                       destination.type === 'assembly_point' ? 'A' : 'P') +
                      '</div>',
                iconSize: [32, 32]
            });

            L.marker([destination.lat, destination.lon], {
                icon: markerIcon
            })
            .addTo(wildfireMap)
            .bindPopup(
                '<strong>' + destination.name + '</strong><br>' +
                destination.type + '<br>' +
                'Distance: ' + (route.distance / 1000).toFixed(1) + 'km<br>' +
                route.explanation.join('<br>')
            );

            route.line = routeLine;
        });

        // Update the details panel
        const detailsPanel = document.getElementById('fire-details-content');
        if (detailsPanel && optimalRoutes.length > 0) {
            let routesHTML = '<div class="evacuation-routes">';
            routesHTML += '<h3>Recommended Evacuation Routes</h3>';
            
            optimalRoutes.forEach((route, index) => {
                routesHTML += '<div class="route-option" data-route-index="' + index + '">';
                routesHTML += '<strong>Option ' + (index + 1) + ':</strong> ';
                routesHTML += 'To ' + route.destination.name;
                routesHTML += ' (' + Math.round(route.distance / 1609.34) + ' miles)';
                routesHTML += '<div class="route-explanation">';
                route.explanation.forEach(reason => {
                    routesHTML += '<div>' + reason + '</div>';
                });
                routesHTML += '</div></div>';
            });
            
            routesHTML += '</div>';
            detailsPanel.innerHTML += routesHTML;
        }

        return optimalRoutes;
    } catch (error) {
        console.error('Error finding evacuation routes:', error);
        return [];
    }
}
            

async function findSafeEvacuationPoints(startLat, startLon, fireLocation) {
    const bbox = calculateBoundingBox(startLat, startLon, 50); // 50km radius

    try {
        // Query emergency facilities using Overpass API
        const response = await fetch('https://overpass-api.de/api/interpreter', {
            method: 'POST',
            body: `[out:json][timeout:25];(
                node["amenity"="shelter"](${bbox});
                node["emergency"="assembly_point"](${bbox});
                node["amenity"="hospital"](${bbox});
            );out body;>;out skel qt;`
        });

        const data = await response.json();
        
        // Filter points outside danger zone
        return data.elements
            .filter(element => {
                const distance = calculateDistance(
                    fireLocation.lat,
                    fireLocation.lon,
                    element.lat,
                    element.lon
                );
                return distance > 20; // More than 20km from fire
            })
            .map(element => ({
                type: element.tags.amenity || element.tags.emergency,
                name: element.tags.name || 'Emergency Facility',
                lat: element.lat,
                lon: element.lon
            }));
    } catch (error) {
        console.error('Error fetching safe points:', error);
        return [];
    }
}

async function fetchRoute(startLat, startLon, endLat, endLon) {
    try {
        // Using OSRM for routing
        const response = await fetch(
            `https://router.project-osrm.org/route/v1/driving/` +
            `${startLon},${startLat};${endLon},${endLat}` +
            `?overview=full&geometries=geojson`
        );
        const data = await response.json();
        return data.routes[0];
    } catch (error) {
        console.error('Error fetching route:', error);
        return null;
    }
}

function drawRoute(route, color) {
    if (!route || !route.geometry) return;

    L.geoJSON(route.geometry, {
        style: {
            color: color,
            weight: 4,
            opacity: 0.7
        }
    }).addTo(wildfireMap);
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
    // Change from alert to console.warn for less intrusive messaging
    console.warn('Unable to retrieve your location');
    
    // Check for stored coordinates first
    const storedLat = localStorage.getItem(STORED_LAT);
    const storedLon = localStorage.getItem(STORED_LON);
    
    if (storedLat && storedLon) {
        // Use last known location
        successLocation({ 
            coords: { 
                latitude: parseFloat(storedLat), 
                longitude: parseFloat(storedLon) 
            } 
        });
    } else {
        // Default to continental US center instead of Honolulu
        const defaultLat = 39.8283;
        const defaultLon = -98.5795;
        successLocation({ 
            coords: { 
                latitude: defaultLat, 
                longitude: defaultLon 
            } 
        });
    }
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
                console.log('Found fire coordinates:', foundFire.lat, foundFire.lon);
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

            console.log('Nominatim returned coordinates:', {
                searchTerm: input,
                lat: lat,
                lon: lon,
                fullLocation: location.display_name
            });

            console.log('Location search coordinates:', lat, lon);
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
// Add getWindDirection function here
function getWindDirection(degrees) {
    const directions = ['N', 'NNE', 'NE', 'ENE', 'E', 'ESE', 'SE', 'SSE', 'S', 'SSW', 'SW', 'WSW', 'W', 'WNW', 'NW', 'NNW'];
    const index = Math.round(degrees / 22.5) % 16;
    return directions[index];
}

async function fetchNWSAlerts(lat, lon) {
    const alertContainer = document.getElementById('alert-banner');
    if (!alertContainer) return;

    alertContainer.innerHTML = `
        <h2>Weather Alerts</h2>
        <p>Loading alerts...</p>
    `;

    try {
        const headers = {
            'Accept': 'application/geo+json',
            'User-Agent': '(2Safety, https://j19s84.github.io/, contact@2safety.app)'
        };

        const pointResponse = await fetch(
            `https://api.weather.gov/points/${lat},${lon}`,
            { headers }
        );
        const pointData = await pointResponse.json();
        console.log('NWS Point Response:', pointData); 

        const forecastZone = pointData.properties.forecastZone.split('/').pop();
        const county = pointData.properties.county.split('/').pop();

        const [zoneAlerts, countyAlerts] = await Promise.all([
            fetch(`https://api.weather.gov/alerts/active/zone/${forecastZone}`, { headers }),
            fetch(`https://api.weather.gov/alerts/active/zone/${county}`, { headers })
        ]);

        const zoneData = await zoneAlerts.json();
        const countyData = await countyAlerts.json();

        const allFeatures = [...(zoneData.features || []), ...(countyData.features || [])];
        const alertsData = {
            features: Array.from(new Set(allFeatures))
        };

        if (alertsData.features && alertsData.features.length > 0) {
            const alertTags = new Set();
            const alertsHTML = alertsData.features.map(feature => {
                const props = feature.properties;
                const severity = props.severity.toLowerCase();
                const tags = generateAlertTags(props);

                if (props.event.toLowerCase().includes('fire')) alertTags.add('🔥 Fire Risk');
                if (props.event.toLowerCase().includes('wind')) alertTags.add('🌬️ High Winds');
                if (props.event.toLowerCase().includes('heat')) alertTags.add('🌡️ Extreme Heat');
                if (props.event.toLowerCase().includes('evacuation')) alertTags.add('⚠️ Evacuation');

                return `
                    <div class="alert-container alert-${severity}">
                        <div class="alert-header" onclick="toggleAlert(this)">
                            <h3>${props.event}</h3>
                            <span class="expand-icon">▼</span>
                        </div>
                        <div class="alert-content collapsed">
                            <div class="alert-tags-container">
                                ${tags}
                            </div>
                            <div class="alert-summary">
                                ${props.headline || 'No headline available'}
                            </div>
                            <p>${props.description || 'No description available'}</p>
                            <div class="alert-source">
                                Source: <a href="${props.url}" target="_blank">National Weather Service</a>
                                <br>
                                Effective: ${new Date(props.effective).toLocaleString()}
                                <br>
                                Expires: ${new Date(props.expires).toLocaleString()}
                            </div>
                        </div>
                    </div>
                `;
            }).join('');

            const riskResult = calculateFireRisk(null, alertsData.features, false);
            const riskIndicator = document.getElementById('risk-indicator');
            if (riskIndicator) {
                riskIndicator.textContent = `Risk Level: ${riskResult.level}`;
                riskIndicator.className = `risk-indicator risk-${riskResult.level.toLowerCase()}`;
            }

            alertContainer.innerHTML = `
                <h2>Weather Alerts</h2>
                ${alertsHTML}
            `;
        } else {
            const riskResult = calculateFireRisk(null, [], false);
            const riskIndicator = document.getElementById('risk-indicator');
            if (riskIndicator) {
                riskIndicator.textContent = `Risk Level: ${riskResult.level}`;
                riskIndicator.className = `risk-indicator risk-${riskResult.level.toLowerCase()}`;
            }

            alertContainer.innerHTML = `
                <h2>Weather Alerts</h2>
                <p>No active alerts found for this location.</p>
            `;
        }
    } catch (error) {
        console.error('Error fetching alerts:', error);
        console.error('Error details:', error.stack);

        alertContainer.innerHTML = `
            <h2>Weather Alerts</h2>
            <p>Error loading alerts. Please try again later.</p>
        `;

        // Calculate and update risk even when alerts fail
        const riskResult = calculateFireRisk(null, [], false);
        updateRiskLevel(riskResult.level);
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
    icon.style.transform = content.classList.contains('collapsed') ? 
        'rotate(0deg)' : 'rotate(180deg)';
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

    // Store the new location
    localStorage.setItem(STORED_LAT, lat);
    localStorage.setItem(STORED_LON, lon);

    // Fetch all necessary data
    fetchWeatherData(lat, lon).catch(err => console.error('Weather error:', err));
    fetchWildfireData(lat, lon).catch(err => console.error('Wildfire error:', err));
    fetchNWSAlerts(lat, lon).catch(err => console.error('NWS error:', err));
    fetchNIFCData(lat, lon).catch(err => console.error('NIFC error:', err));

    // Update map view
    if (wildfireMap) {
        wildfireMap.setView([lat, lon], 10);
    }
}

function calculateFireRisk(weatherData, alerts, isUrban = false) {
    if (currentRiskLevel === 'EXTREME') {
        return {
            score: 10,
            level: 'EXTREME',
            tags: ['🔥 Active Fire']
        };
    }
    
    let riskScore = 0;
    let riskLevel = 'LOW';
    const alertTags = new Set();
    const EXTREME_RADIUS = 15; // miles
    const HIGH_RADIUS = 20; // miles
    const LOW_RADIUS = 40; // miles

    // Process alerts and create tags
    if (alerts && alerts.length > 0) {
        let weatherAlertCount = 0;
        alerts.forEach(alert => {
            const event = alert?.properties?.event || '';
            const distance = alert?.properties?.distance || LOW_RADIUS + 1; // Default to outside range if unknown
            
            // Immediate extreme conditions
            if (distance <= EXTREME_RADIUS && 
                (event.includes('Fire') || event.includes('Evacuation'))) {
                riskLevel = 'EXTREME';
                riskScore = 10; // Ensure it stays extreme
                alertTags.add('⚠️ Immediate Threat');
            }
            
            // Count contributing weather factors
            if (event.includes('Red Flag')) {
                weatherAlertCount++;
                alertTags.add('🚩 Red Flag Warning');
                riskScore += 3;
            }
            if (event.includes('Wind')) {
                weatherAlertCount++;
                alertTags.add('🌬️ High Winds');
                riskScore += 2;
            }
            if (event.includes('Heat')) {
                weatherAlertCount++;
                alertTags.add('🌡️ Heat Alert');
                riskScore += 2;
            }
            if (event.includes('Humidity')) {
                weatherAlertCount++;
                alertTags.add('💧 Low Humidity');
                riskScore += 2;
            }
           
        });

        // Adjust for multiple contributing factors
        if (weatherAlertCount >= 3 && riskLevel !== 'EXTREME') {
            riskLevel = 'HIGH';
            riskScore = Math.max(riskScore, 7);
        }
    }

    // Final risk level determination if not already extreme
    if (riskLevel !== 'EXTREME') {
        if (riskScore >= 7) {
            riskLevel = 'HIGH';
        } else if (riskScore >= 4) {
            riskLevel = 'MODERATE';
        } else {
            riskLevel = 'LOW';
        }
    }

    return {
        score: riskScore,
        level: riskLevel,
        tags: Array.from(alertTags)
    };
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

class SOSPlan {
    constructor(location, alerts, risks) {
        this.location = location;
        this.alerts = alerts;
        this.risks = risks;
        this.evacuationRoutes = [];
        this.safetyLocations = [];
        this.userProfile = null;
        this.femaData = null;
    }

    async initialize() {
        try {
            const bbox = calculateBoundingBox(this.location.lat, this.location.lon, 25);
    
            // Fetch emergency facilities
            const overpassResponse = await fetch(`https://overpass-api.de/api/interpreter`, {
                method: 'POST',
                body: `[out:json][timeout:25];(
                    node["amenity"="shelter"](${bbox});
                    node["emergency"="assembly_point"](${bbox});
                    node["amenity"="fire_station"](${bbox});
                    node["amenity"="hospital"](${bbox});
                    node["emergency"="evacuation_point"](${bbox});
                );out body;>;out skel qt;`
            });
            const facilities = await overpassResponse.json();
            
            // Process facilities and evacuation routes
            this.processEvacuationData(facilities);
            
        } catch (error) {
            console.error('Error initializing SOS Plan:', error);
            throw error;
        }
    }
    
    processEvacuationData(facilities) {
        // Process emergency facilities
        this.safetyLocations = facilities.elements.map(facility => ({
            type: facility.tags.amenity || facility.tags.emergency,
            name: facility.tags.name || 'Unnamed Facility',
            lat: facility.lat,
            lon: facility.lon,
            distance: calculateDistance(
                this.location.lat, 
                this.location.lon, 
                facility.lat, 
                facility.lon
            )
        }));
    
        // Sort by distance
        this.safetyLocations.sort((a, b) => a.distance - b.distance);
    }

    generateEvacuationPlan() {
        const plan = {
            riskLevel: this.risks.current,
            immediateActions: [],
            evacuationRoutes: [],
            safeLocations: [],
            timeEstimates: {},
            specialConsiderations: []
        };

        // Add immediate actions based on alerts
        if (this.alerts.includes('🔥 Fire Risk')) {
            plan.immediateActions.push({
                priority: 1,
                action: '🎒 Pack emergency kit',
                details: 'Include water, non-perishable food, medications'
            });
        }

        return plan;
    }
}

// User profile configuration (after the class definition)
const userProfile = {
    household: {
        totalMembers: 2,  // Example number
        minors: 0,
        seniors: 0,
        pets: {
            dogs: 1,      // Example: 1 dog
            cats: 0,
            other: 0,
            total: 1      // Important: Add this total
        }
    },
    mobility: {
        hasDisabilities: false,
        requiresAssistance: false
    },
    medical: {           // Add this section
        requiresAssistance: false,
        hasDisabilities: false,
        medications: false
    },
    transportation: {
        hasVehicle: true,
        vehicleType: 'sedan',  // Options: 'sedan', 'suv', '4x4'
        fuelRange: 300        // Range in miles
    },
    evacuation: {
        predefinedLocation: null,
        maxTravelDistance: 50  // in miles
    }
};


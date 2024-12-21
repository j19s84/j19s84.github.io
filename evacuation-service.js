class EvacuationService {
    constructor() {
        this.router = new EvacuationRouter({
            medical: { requiresAssistance: false },
            mobility: { hasDisabilities: false },
            household: { pets: { total: 0 } },
            transportation: { vehicleType: 'sedan' }
        });
    }

    async findSafeLocations(fireLocation, userLocation) {
        try {
            // First, find potential safe locations within 50 mile radius
            const safeLocations = await this.fetchSafeLocations(userLocation);
            
            // Filter out locations in fire's path using wind direction
            const windData = await this.getWindData(fireLocation);
            const filteredLocations = this.filterSafeLocations(safeLocations, fireLocation, windData);
            
            // Get routes to each safe location
            const routes = await Promise.all(
                filteredLocations.map(loc => 
                    this.getRoute(userLocation, loc)
                )
            );

            // Use router to find optimal routes
            const optimalRoutes = await this.router.findOptimalRoute(
                userLocation,
                routes
            );

            return optimalRoutes;
        } catch (error) {
            console.error('Error finding safe locations:', error);
            return [];
        }
    }

    async fetchSafeLocations(location) {
        // Fetch from OpenStreetMap Overpass API
        const query = `
            [out:json][timeout:25];
            (
                way["amenity"="shelter"](around:80000,${location.lat},${location.lon});
                way["amenity"="hospital"](around:80000,${location.lat},${location.lon});
                way["amenity"="fire_station"](around:80000,${location.lat},${location.lon});
            );
            out body;
            >;
            out skel qt;
        `;

        const response = await fetch('https://overpass-api.de/api/interpreter', {
            method: 'POST',
            body: query
        });

        return await response.json();
    }

    async getWindData(location) {
        // Use OpenWeatherMap for wind data
        const API_KEY = '8224d2b200e0f0663e86aa1f3d1ea740';
        const response = await fetch(
            `https://api.openweathermap.org/data/2.5/weather?lat=${location.lat}&lon=${location.lon}&appid=${API_KEY}`
        );
        const data = await response.json();
        return {
            speed: data.wind.speed,
            direction: data.wind.deg
        };
    }

    filterSafeLocations(locations, fireLocation, windData) {
        return locations.filter(location => {
            // Calculate if location is in wind direction from fire
            const bearing = this.calculateBearing(
                fireLocation.lat,
                fireLocation.lon,
                location.lat,
                location.lon
            );

            // Allow 45-degree cone of safety
            const windDirection = windData.direction;
            const angleFromWind = Math.abs(bearing - windDirection);
            
            return angleFromWind > 45;
        });
    }

    calculateBearing(lat1, lon1, lat2, lon2) {
        const φ1 = lat1 * Math.PI/180;
        const φ2 = lat2 * Math.PI/180;
        const Δλ = (lon2-lon1) * Math.PI/180;

        const y = Math.sin(Δλ) * Math.cos(φ2);
        const x = Math.cos(φ1)*Math.sin(φ2) -
                Math.sin(φ1)*Math.cos(φ2)*Math.cos(Δλ);
        const θ = Math.atan2(y, x);
        return (θ*180/Math.PI + 360) % 360;
    }

    async getRoute(from, to) {
        // Use OSRM for routing
        const response = await fetch(
            `https://router.project-osrm.org/route/v1/driving/` +
            `${from.lon},${from.lat};${to.lon},${to.lat}?overview=full`
        );
        return await response.json();
    }
} 

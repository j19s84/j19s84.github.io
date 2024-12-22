// Evacuation Router Class
class EvacuationRouter {
    constructor(map) {
        this.map = map;
        this.currentRoutes = [];
        this.markers = [];
    }

    async showEvacuationRoutes(fireLat, fireLon) {
        this.clearExistingRoutes();
        
        try {
            const safeDestinations = await this.findSafeDestinations(fireLat, fireLon);
            const routes = await this.calculateEvacuationRoutes(
                { lat: fireLat, lon: fireLon },
                safeDestinations.slice(0, 3)
            );
            
            this.displayEvacuationRoutes(routes);
        } catch (error) {
            console.error('Error showing evacuation routes:', error);
        }
    }

    // ... (copy all the other functions from the previous code, but remove 'function' keyword)
    async findSafeDestinations(fireLat, fireLon) {
        // ... same code as before
    }

    async calculateEvacuationRoutes(start, destinations) {
        // ... same code as before
    }

    displayEvacuationRoutes(routes) {
        // ... same code as before
    }

    highlightRoute(index) {
        // ... same code as before
    }

    getRouteColor(index) {
        // ... same code as before
    }

    getDestinationIcon(type) {
        // ... same code as before
    }

    clearExistingRoutes() {
        // ... same code as before
    }
}

// Export the class
export default EvacuationRouter; 

class EvacuationRouter {
    constructor(userProfile) {
        // Store information about the user
        this.profile = userProfile;
        
        // How important each factor is (total = 1.0)
        this.weights = {
            distance: 0.3,    // How far they need to travel
            traffic: 0.2,     // How busy the roads are
            facilityType: 0.2, // What kind of place they're going to
            accessibility: 0.3 // How easy it is to get there
        };
        
        // Scores for different types of facilities
        // Higher numbers = better match
        this.facilityPreferences = {
            hospital: {
                medical: 10,  // Best for people needing medical care
                default: 5    // OK for everyone else
            },
            shelter: {
                default: 7,   // Good for most people
                pets: 8       // Better for people with pets
            },
            assembly_point: {
                default: 6,           // OK for most people
                mobility_impaired: 4  // Not great for people with mobility issues
            }
        };
    }

    // Calculate how good a route is (0-10 scale)
    calculateRouteScore(route, facility) {
        // Start with 0
        let score = 0;
        
        // Shorter distance = better score
        const distanceScore = 1 / (route.distance / 1000); 
        
        // Less traffic = better score
        const trafficScore = 1 - (route.congestion || 0);
        
        // How good is this facility for this person?
        const facilityScore = this.calculateFacilityScore(facility);
        
        // How easy is it to use this route?
        const accessibilityScore = this.calculateAccessibilityScore(route);
        
        // Combine all scores using weights
        score = (distanceScore * this.weights.distance) +
                (trafficScore * this.weights.traffic) +
                (facilityScore * this.weights.facilityType) +
                (accessibilityScore * this.weights.accessibility);
                
        return score;
    }

    // Figure out how good a facility is for this person
    calculateFacilityScore(facility) {
        const prefs = this.facilityPreferences[facility.type];
        
        // If they need medical help, hospitals are best
        if (this.profile.medical.requiresAssistance && facility.type === 'hospital') {
            return prefs.medical;
        }
        
        // If they have pets, pet-friendly shelters are better
        if (this.profile.household.pets.total > 0 && facility.type === 'shelter') {
            return prefs.pets;
        }
        
        // Use default score if no special needs
        return prefs.default || 5;
    }

    // Check how easy the route is to use
    calculateAccessibilityScore(route) {
        let score = 10;
        
        // Lower score for steep routes if person has mobility issues
        if (this.profile.mobility.hasDisabilities && route.elevation_gain > 50) {
            score -= (route.elevation_gain / 50);
        }
        
        // Lower score for unpaved roads
        if (route.surface === 'unpaved') {
            score -= 3;
        }
        
        // Lower score for rough terrain if using a car
        if (this.profile.transportation.vehicleType === 'sedan' && route.terrain === 'rough') {
            score -= 4;
        }
        
        return Math.max(0, score) / 10;
    }

    // Find the best routes
    async findOptimalRoute(currentLocation, availableRoutes) {
        // Score each route
        const scoredRoutes = availableRoutes.map(route => ({
            ...route,
            score: this.calculateRouteScore(route, route.destination)
        }));

        // Sort routes by score (best first)
        scoredRoutes.sort((a, b) => b.score - a.score);

        // Take top 3 routes and add explanations
        return scoredRoutes.slice(0, 3).map(route => ({
            ...route,
            explanation: this.generateExplanation(route)
        }));
    }

    // Create human-readable explanations for why a route was chosen
    generateExplanation(route) {
        const reasons = [];
        
        // If route is less than 10km
        if (route.distance < 10000) {
            reasons.push("✓ Close to your location");
        }
        
        // If route leads to hospital and person needs medical help
        if (route.destination.type === 'hospital' && this.profile.medical.requiresAssistance) {
            reasons.push("✓ Medical facilities available");
        }
        
        // If route leads to shelter and person has pets
        if (route.destination.type === 'shelter' && this.profile.household.pets.total > 0) {
            reasons.push("✓ Pet-friendly facility");
        }
        
        return reasons;
    }
} 

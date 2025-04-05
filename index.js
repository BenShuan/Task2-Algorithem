// Driver Scheduling Optimization

import fs from "fs";
import path from "path";

const OSRMURL = "http://router.project-osrm.org/route/v1/driving/";
const DRIVERCOST = 30; // cost per hour
let APICALLS = 0; // Counter for API calls

const CACHE_FILE = "distanceCache.json";
let distanceCache = new Map(); // Cache for distance calculations
let unAssignedRides = [];

const driversAvilability = [
  {
    driverId: "driver1",
    availability: [
      { date: "2025-03-10", start: "08:00", end: "18:00" },
      { date: "2025-03-11", start: "09:00", end: "17:00" },
    ],
  },
  {
    driverId: "driver2",

    availability: [
      { date: "2025-03-10", start: "07:00", end: "19:00" },
      { date: "2025-03-11", start: "10:00", end: "16:00" },
    ],
  },
  {
    driverId: "driver3",

    availability: [
      { date: "2025-03-10", start: "08:00", end: "18:00" },
      { date: "2025-03-11", start: "09:00", end: "17:00" },
    ],
  },  {
    driverId: "driver4",

    availability: [
      { date: "2025-03-10", start: "08:00", end: "18:00" },
      { date: "2025-03-11", start: "09:00", end: "17:00" },
    ],
  },
];

// Load cache from file on startup
try {
  const cacheData = fs.readFileSync(CACHE_FILE, "utf-8");
  distanceCache = new Map(JSON.parse(cacheData));
} catch (error) {
  console.log("Cache file not found or invalid, starting with empty cache.");
}

// Save cache to file
const saveCache = () => {
  const cacheData = JSON.stringify(Array.from(distanceCache.entries()));
  fs.writeFileSync(CACHE_FILE, cacheData);
};

const fetchDistanceDuration = async (cordArr1, cordArr2) => {
  const cordString = `${cordArr1.join(",")};${cordArr2.join(",")}`;
  const cordString2 = `${cordArr2.join(",")};${cordArr1.join(",")}`;

  // Check if result is in cache
  if (distanceCache.has(cordString) || distanceCache.has(cordString2)) {
    return distanceCache.get(cordString) || distanceCache.get(cordString2);
  }

  const url = OSRMURL + cordString + "?overview=false";

  const res = await fetch(url, {
    method: "GET",
    headers: {
      "Content-Type": "application/json",
    },
  });
  APICALLS++;
  if (!res.ok) {
    console.log("[Error] Error fetching distance data:", res.statusText);
    return null;
  }
  const data = await res.json();

  const result = {
    distance: data.routes[0].distance / 1000,
    duration: data.routes[0].duration / 3600,
  };

  distanceCache.set(cordString, result);
  saveCache();

  return result; // in km andco hours
};

/**
 * Calculate the distance between two coordinates using the Haversine formula
 * @param {[number, number]} coords1 - [latitude, longitude] of first point
 * @param {[number, number]} coords2 - [latitude, longitude] of second point
 * @returns {number} - Distance in kilometers
 */
function calculateDistance(coords1, coords2) {
  const [lat1, lon1] = coords1;
  const [lat2, lon2] = coords2;

  const R = 6371; // Earth's radius in km
  const dLat = ((lat2 - lat1) * Math.PI) / 180;
  const dLon = ((lon2 - lon1) * Math.PI) / 180;

  const a =
    Math.sin(dLat / 2) * Math.sin(dLat / 2) +
    Math.cos((lat1 * Math.PI) / 180) *
      Math.cos((lat2 * Math.PI) / 180) *
      Math.sin(dLon / 2) *
      Math.sin(dLon / 2);

  const c = 2 * Math.atan2(Math.sqrt(a), Math.sqrt(1 - a));
  return R * c;
}

/**
 * Calculate the travel time between two points based on an average speed
 * @param {number} distance - Distance in kilometers
 * @param {number} avgSpeed - Average speed in km/h (default 50 km/h)
 * @returns {number} - Travel time in minutes
 */
function calculateTravelTime(distance, avgSpeed = 50) {
  return (distance / avgSpeed) * 60; // Convert hours to minutes
}

/**
 * Parse time string into minutes from midnight
 * @param {string} timeStr - Time in format "HH:MM"
 * @returns {number} - Minutes from midnight
 */
function parseTimeToMinutes(timeStr) {
  const [hours, minutes] = timeStr.split(":").map(Number);
  return hours * 60 + minutes;
}

/**
 * Check if a driver can reach a ride on time
 * @param {Object} previousRide - The previous ride
 * @param {Object} nextRide - The potential next ride
 * @param {[number, number]} driverLocation - Driver's current location coordinates

 */
async function canReachRideOnTime(previousRide, nextRide, driverLocation) {
  // If this is the first ride, check if driver can reach from their city
  if (!previousRide) {
    return true; // Driver can always reach from their city
  }

  // If there was a previous ride, check if driver can go from previous ride to next ride
  const previousRideEndTime = parseTimeToMinutes(previousRide.endTime);
  const nextRideStartTime = parseTimeToMinutes(nextRide.startTime);

  if (previousRide.date !== nextRide.date) {
    // Different days, so driver can make it
    return true;
  }

  if (nextRideStartTime <= previousRideEndTime) {
    // Next ride starts before or at the same time previous ride ends
    return false;
  }

  // Calculate potantial arrivel time to next ride

  const potantialDistance = calculateDistance(
    previousRide.endPoint_coords,
    nextRide.startPoint_coords
  );

  const potantialTravelTime = calculateTravelTime(potantialDistance);

  // Check if the driver can reach the next ride on time
  if (potantialTravelTime + previousRideEndTime > nextRideStartTime) {
    // Driver can't reach on time
    return false;
  }

  const distanceBetweenRides = await fetchDistanceDuration(
    previousRide.endPoint_coords,
    nextRide.startPoint_coords
  );

  const travelTime = distanceBetweenRides.duration * 60; // in minutes

  // Add 10 minutes buffer time
  return previousRideEndTime + travelTime + 10 <= nextRideStartTime;
}

/**
 * Calculate the cost of assigning a driver to a ride
 * @param {Object} driver - Driver object
 * @param {Object} ride - Ride object
 * @param {[number, number]} startLocation - Starting location coordinates
 * @returns {Object} - Cost breakdown and total
 */
async function calculateRideCost(driver, ride, startLocation) {
  // Calculate distance from starting point to ride start

  const distanceToRideStart = await fetchDistanceDuration(
    startLocation,
    ride.startPoint_coords
  );

  await new Promise((resolve) => setTimeout(resolve, 1000)); // Delay to avoid API rate limit

  // Calculate distance of the ride itself
  const rideDistance = await fetchDistanceDuration(
    ride.startPoint_coords,
    ride.endPoint_coords
  );

  // Calculate total distance
  const totalDistance = distanceToRideStart.distance + rideDistance.distance;

  // Calculate fuel cost based on driver's fuel cost per km
  const fuelCost = totalDistance * driver.fuelCost;

  // Calculate labor cost (assuming $20/hour and time includes getting to the ride)
  const travelTimeToRide = distanceToRideStart.duration * 60; // in minutes
  const rideStartTime = parseTimeToMinutes(ride.startTime);
  const rideEndTime = parseTimeToMinutes(ride.endTime);
  const rideDuration = rideEndTime - rideStartTime;
  const totalTime = travelTimeToRide + rideDuration;
  const laborCost = (totalTime / 60) * DRIVERCOST; // Convert minutes to hours and multiply by hourly rate

  return {
    fuelCost,
    laborCost,
    totalCost: fuelCost + laborCost,
  };
}

/**
 * Sort rides chronologically by date and start time
 * @param {Array} rides - Array of ride objects
 * @returns {Array} - Sorted rides
 */
function sortRidesChronologically(rides) {
  return [...rides].sort((a, b) => {
    if (a.date !== b.date) {
      return new Date(a.date) - new Date(b.date);
    }
    return parseTimeToMinutes(a.startTime) - parseTimeToMinutes(b.startTime);
  });
}


 // Helper function to check if a driver can handle a ride in terms of time and capacity
 const canAssignRideToDriver = async (
  driver,
  ride,
  previousRide,
  startLocation
) => {
  // Check if the driver can handle the ride capacity
  if (driver.numberOfSeats < ride.numberOfSeats) {
    return false;
  }

  // Check if the driver is available for the ride date and time
  const rideDate = new Date(ride.date);
  const rideStartTime = parseTimeToMinutes(ride.startTime);
  const rideEndTime = parseTimeToMinutes(ride.endTime);

  const driverFromAvilability = driversAvilability.find((availability) => availability.driverId === driver.driverId);

  const driverAvailability = driverFromAvilability.availability.find(
    (availability) =>
      availability.date === rideDate.toISOString().split("T")[0] &&
      rideStartTime >= parseTimeToMinutes(availability.start) &&
      rideEndTime <= parseTimeToMinutes(availability.end)
  );

  if (!driverAvailability) {
    return false;
  }


  // Check if the driver can reach the ride on time
  const canReachOnTime = await canReachRideOnTime(
    previousRide,
    ride,
    startLocation
  );
  if (!canReachOnTime) {
    return false;
  }

  return true;
};

/**
 * Find optimal assignments of drivers to rides
 * @param {Array} drivers - Array of driver objects
 * @param {Array} rides - Array of ride objects
 * @returns {Object} - Optimal assignments and total cost
 */
async function optimizeDriverScheduling(drivers, rides) {
  // Sort rides chronologically
  const sortedRides = sortRidesChronologically(rides);

  // Track assignments and costs
  const assignments = [];
  let totalCost = 0;

  // Initialize driver schedules
  const driverSchedules = {};
  drivers.forEach((driver) => {
    driverSchedules[driver.driverId] = [];
  });

 

  // Greedy algorithm to assign rides one by one
  for (const ride of sortedRides) {
    let bestDriver = null;
    let bestCost = Infinity;
    let bestStartLocation = null;

    console.log('Search a driver for ride ', ride._id,"\n");
    // Find the best driver for this ride
    for (const driver of drivers) {
      // Get driver's current schedule
      const schedule = driverSchedules[driver.driverId];
      const previousRide =
        schedule.length > 0 ? schedule[schedule.length - 1] : null;

      // Determine start location (either driver's city or last ride end point)
      const startLocation = previousRide
        ? previousRide.endPoint_coords
        : driver.city_coords;

      // Check if this driver can handle this ride
      const canAssign = await canAssignRideToDriver(
        driver,
        ride,
        previousRide,
        startLocation
      );
      if (!canAssign) continue;
      // Calculate cost for this assignment
      const cost = await calculateRideCost(driver, ride, startLocation);

      if (cost.totalCost < bestCost) {
        bestCost = cost.totalCost;
        bestDriver = driver;
        bestStartLocation = startLocation;
      }
    }

    // Assign the ride to the best driver if found
    if (bestDriver) {
      // Check if the driver is already in the assignments array
      // Update the drive ride array
      const index = assignments.findIndex(
        (ass) => ass.driverId === bestDriver.driverId
      );
      if (index !== -1) {
        assignments[index].rideIds.push(ride._id);
      } else {
        assignments.push({ driverId: bestDriver.driverId, rideIds: [] });
      }

      console.log(`Driver ${bestDriver.driverId} assigned to ride ${ride._id}\n`);
      
      // Update driver's schedule
      driverSchedules[bestDriver.driverId].push(ride);

      totalCost += bestCost;
    } else {
      unAssignedRides.push(ride._id);
      console.warn(`No suitable driver found for ride ${ride._id}\n`);
    }
  }

  return {
    assignments,
    totalCost,
    // driverSchedules,
  };
}

const driversGreedy = JSON.parse(fs.readFileSync("drivers.json"));
const ridesGreedy = JSON.parse(fs.readFileSync("rides.json"));

// // Run the optimization
const resultGreedy = await optimizeDriverScheduling(driversGreedy, ridesGreedy);
console.log("Greedy Algorithm Results");
console.table(resultGreedy.assignments);
console.log("UnAssigned Rides:", unAssignedRides);
console.log("Total Cost:", resultGreedy.totalCost);

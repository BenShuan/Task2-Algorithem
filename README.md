# 🧠 Driver Scheduling Optimization - README

## 📌 Overview

This project implements a **greedy algorithm** to solve a driver-to-ride assignment problem with the goal of **maximizing ride coverage** while **minimizing total cost** (labor + fuel). It takes into account:
- Drivers’ availability by date and time
- Ride start/end times and locations
- Driver constraints like seating capacity and fuel cost
- Travel feasibility between rides using OSRM routing API

---

## 🧱 Algorithm Structure

### 1. **Data Preprocessing**
- Drivers and rides are loaded from local `.json` files.
- Rides are **sorted chronologically** to ensure the earliest rides are handled first.
- A **distance cache** is implemented to avoid redundant API calls to OSRM.

### 2. **Driver Availability**
- Each driver has a set of availability slots per day.
- Before assigning a ride, the algorithm checks if the driver is available during that time window.

### 3. **Feasibility Check**
- **Capacity Check**: Ensures the driver has enough seats for the ride.
- **Time Feasibility**: Verifies the driver can reach the ride’s start location in time (with a buffer).
- For multiple rides, the driver's current schedule is tracked to validate consecutive ride feasibility.

### 4. **Cost Evaluation**
- **Fuel Cost**: Based on the total distance (to ride start + ride distance) and the driver’s per-km fuel rate.
- **Labor Cost**: Based on total time (travel time to ride + ride duration) multiplied by a fixed hourly rate.

### 5. **Greedy Assignment**
- For each ride, the algorithm:
  1. Iterates through all drivers.
  2. Filters out ineligible drivers (capacity, availability, timing).
  3. Calculates total cost for eligible drivers.
  4. Selects the **cheapest valid option** (greedy choice).
- The selected driver is assigned to the ride and their schedule is updated.

---

## 🧮 Output
- A list of assignments (`driverId -> rideIds[]`)
- A list of unassigned rides
- The total operational cost (fuel + labor)
- Number of API calls made to OSRM

---

## 📦 Example Command
```bash
npm start
```

---

## 🧠 Design Decisions
- **Greedy Heuristic**: Chosen for its simplicity and efficiency in handling real-time or large datasets. It prioritizes local optimal cost per ride.
- **Easy to emplement**: There are algorithms that can find the optimal scheduling, but they are harder to implement. Therefore, I went with a simpler solution that can achieve a low cost, even if it's not the absolute minimum.
- **External Routing API**: OSRM provides real-world distance and duration, improving accuracy over simple Haversine formula.
- **Caching**: Distance results are cached in `distanceCache.json` to reduce redundant API requests and improve performance.
- **Buffer Time**: A 10-minute buffer is added between rides to simulate realistic transition time.

---

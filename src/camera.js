import * as Cesium from 'cesium';

/**
 * Camera presets for notable locations.
 * Startup flies to the user's location when the browser already has it,
 * and to Austin otherwise.
 */
export const CAMERA_PRESETS = {
  austin: {
    destination: Cesium.Cartesian3.fromDegrees(-97.7431, 30.2672, 800),
    orientation: {
      heading: Cesium.Math.toRadians(0),
      pitch: Cesium.Math.toRadians(-35),
      roll: 0.0,
    },
  },
  sf: {
    destination: Cesium.Cartesian3.fromDegrees(-122.4194, 37.7749, 1000),
    orientation: {
      heading: Cesium.Math.toRadians(30),
      pitch: Cesium.Math.toRadians(-30),
      roll: 0.0,
    },
  },
  nyc: {
    destination: Cesium.Cartesian3.fromDegrees(-73.9857, 40.7484, 1200),
    orientation: {
      heading: Cesium.Math.toRadians(-20),
      pitch: Cesium.Math.toRadians(-30),
      roll: 0.0,
    },
  },
};

/**
 * Fly the camera to a preset location with a smooth animation.
 */
export function flyToPreset(viewer, presetName, duration = 3.0) {
  const preset = CAMERA_PRESETS[presetName];
  if (!preset) return;

  viewer.camera.flyTo({
    destination: preset.destination,
    orientation: preset.orientation,
    duration,
    easingFunction: Cesium.EasingFunction.CUBIC_IN_OUT,
  });
}

/** Austin remains the startup view when the user's location is not already known. */
export const AUSTIN_START = Object.freeze({
  lat: 30.2672,
  lon: -97.7431,
  label: 'Austin, TX',
});

/**
 * Read a location the browser has already been allowed to share.
 * A missing or still-unanswered permission returns null and does not prompt.
 * @param {Navigator} [nav]
 * @returns {Promise<{lat: number, lon: number, label: string}|null>}
 */
export async function knownUserLocation(nav = globalThis.navigator) {
  const geo = nav?.geolocation;
  const query = nav?.permissions?.query;
  if (!geo || typeof query !== 'function') return null;
  let status;
  try {
    status = await query.call(nav.permissions, { name: 'geolocation' });
  } catch {
    return null;
  }
  if (status?.state !== 'granted') return null;
  return readGrantedPosition(geo);
}

function readGrantedPosition(geo) {
  return new Promise((resolve) => {
    geo.getCurrentPosition(
      (position) => {
        const lat = position?.coords?.latitude;
        const lon = position?.coords?.longitude;
        if (!Number.isFinite(lat) || !Number.isFinite(lon)) {
          resolve(null);
          return;
        }
        resolve({ lat, lon, label: 'your location' });
      },
      () => resolve(null),
      { enableHighAccuracy: false, timeout: 4000, maximumAge: 300000 },
    );
  });
}

/** Opening height. The arrival stays 30 km up, over the city rather than the street. */
const START_ALTITUDE_M = 30000;

/**
 * Arrival over a place: overhead, then a short settle that keeps the city in frame.
 * @param {object} viewer
 * @param {{lat: number, lon: number, label?: string}} [place]
 * @returns {Function} Cancels the pending or active flight.
 */
export function flyToStartup(viewer, place = AUSTIN_START) {
  const lat = place.lat;
  const lon = place.lon;
  viewer.camera.setView({
    destination: Cesium.Cartesian3.fromDegrees(lon, lat, 80000),
    orientation: {
      heading: Cesium.Math.toRadians(0),
      pitch: Cesium.Math.toRadians(-90),
      roll: 0.0,
    },
  });
  const timer = setTimeout(() => {
    if (viewer.isDestroyed()) return;
    viewer.camera.flyTo({
      destination: Cesium.Cartesian3.fromDegrees(lon, lat, START_ALTITUDE_M),
      orientation: {
        heading: Cesium.Math.toRadians(15),
        pitch: Cesium.Math.toRadians(-55),
        roll: 0.0,
      },
      duration: 4.0,
      easingFunction: Cesium.EasingFunction.CUBIC_IN_OUT,
    });
  }, 500);
  return () => {
    clearTimeout(timer);
    if (!viewer.isDestroyed()) viewer.camera.cancelFlight();
  };
}

/**
 * Set camera to Austin on load with a cinematic fly-in.
 * @returns {Function} Cancels the pending or active startup flight.
 */
export function flyToAustin(viewer) {
  return flyToStartup(viewer, AUSTIN_START);
}

/**
 * Open over the user's location when it is already known, otherwise Austin.
 * @param {object} viewer
 * @param {{textContent: string}} loaderStatus
 * @param {() => Promise<{lat: number, lon: number, label: string}|null>} [locate]
 * @returns {Function} Cancels the flight.
 */
export function startDefaultFlight(
  viewer,
  loaderStatus,
  locate = knownUserLocation,
) {
  let stop = () => {};
  let closed = false;
  const show = (place) => {
    if (closed || viewer.isDestroyed()) return;
    loaderStatus.textContent = `Flying to ${place.label}...`;
    stop();
    stop = flyToStartup(viewer, place);
  };
  void Promise.resolve()
    .then(locate)
    .then((place) => show(place ?? AUSTIN_START))
    .catch(() => show(AUSTIN_START));
  return () => {
    closed = true;
    stop();
  };
}

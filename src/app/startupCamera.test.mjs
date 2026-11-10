import test from 'node:test';
import assert from 'node:assert/strict';
import * as Cesium from 'cesium';
import {
  AUSTIN_START,
  flyToAustin,
  knownUserLocation,
  startDefaultFlight,
} from '../camera.js';

test('teardown before the initial camera delay prevents a late flight', (t) => {
  t.mock.timers.enable({ apis: ['setTimeout'] });
  let flights = 0;
  let cancelled = 0;
  const stop = flyToAustin({
    isDestroyed: () => false,
    camera: {
      setView() {},
      flyTo() {
        flights++;
      },
      cancelFlight() {
        cancelled++;
      },
    },
  });
  stop();
  t.mock.timers.tick(1000);
  assert.equal(flights, 0);
  assert.equal(cancelled, 1);
});

function viewer() {
  const views = [];
  return {
    isDestroyed: () => false,
    views,
    camera: {
      setView(view) {
        views.push(view);
      },
      flyTo() {},
      cancelFlight() {},
    },
  };
}

function degrees(destination) {
  const carto = Cesium.Cartographic.fromCartesian(destination);
  return {
    lat: Cesium.Math.toDegrees(carto.latitude),
    lon: Cesium.Math.toDegrees(carto.longitude),
  };
}

test('known location is used only after permission was already granted', async () => {
  let prompted = false;
  const granted = await knownUserLocation({
    permissions: { query: async () => ({ state: 'granted' }) },
    geolocation: {
      getCurrentPosition(success) {
        success({ coords: { latitude: 44.1, longitude: -123.2 } });
      },
    },
  });
  assert.deepEqual(granted, { lat: 44.1, lon: -123.2, label: 'your location' });
  const withheld = await knownUserLocation({
    permissions: { query: async () => ({ state: 'prompt' }) },
    geolocation: {
      getCurrentPosition() {
        prompted = true;
      },
    },
  });
  assert.equal(withheld, null);
  assert.equal(prompted, false);
  assert.equal(await knownUserLocation({}), null);
});

test('startup opens over the known location and otherwise Austin', async () => {
  const known = viewer();
  const status = { textContent: '' };
  startDefaultFlight(known, status, () =>
    Promise.resolve({ lat: 44.1, lon: -123.2, label: 'your location' }),
  );
  await new Promise((resolve) => setTimeout(resolve, 0));
  assert.equal(status.textContent, 'Flying to your location...');
  const opened = degrees(known.views[0].destination);
  assert.ok(Math.abs(opened.lat - 44.1) < 0.001);
  assert.ok(Math.abs(opened.lon - -123.2) < 0.001);

  const fallback = viewer();
  const fallbackStatus = { textContent: '' };
  startDefaultFlight(fallback, fallbackStatus, () => Promise.resolve(null));
  await new Promise((resolve) => setTimeout(resolve, 0));
  assert.equal(fallbackStatus.textContent, `Flying to ${AUSTIN_START.label}...`);
  const austin = degrees(fallback.views[0].destination);
  assert.ok(Math.abs(austin.lat - AUSTIN_START.lat) < 0.001);
  assert.ok(Math.abs(austin.lon - AUSTIN_START.lon) < 0.001);
});

'use client';

import { airport, observerRadiusMiles } from '@/lib/airport';

import { useState } from 'react';
import { validViewpoint, type ObserverPreferences } from '@/lib/observer';
import { ResponsiveDialog } from './responsive-dialog';

export function ViewpointPicker({
  mobile = false,
  preferences,
  onChange,
  onClose,
}: {
  mobile?: boolean;
  preferences: ObserverPreferences;
  onChange: (value: ObserverPreferences) => void;
  onClose: () => void;
}) {
  const [lat, setLat] = useState(preferences.viewpoint?.lat.toString() ?? '');
  const [lon, setLon] = useState(preferences.viewpoint?.lon.toString() ?? '');
  const [error, setError] = useState('');
  const [locating, setLocating] = useState(false);
  function save(latitude: number, longitude: number) {
    const viewpoint = {
      lat: Math.round(latitude * 1000) / 1000,
      lon: Math.round(longitude * 1000) / 1000,
    };
    if (!validViewpoint(viewpoint)) {
      setError(
        `Choose a point within ${Math.round(observerRadiusMiles)} miles of ${airport.name}. The feed only covers this area.`,
      );
      return;
    }
    onChange({ mode: 'nearby', viewpoint });
    onClose();
  }
  return (
    <ResponsiveDialog
      mobile={mobile}
      className="viewpoint-modal"
      label="Choose viewing point"
      closeLabel="Close viewing point"
      onClose={onClose}
    >
      <p className="modal-kicker">YOUR WINDOW ON {airport.iata}</p>
      <h2>Where are you watching?</h2>
      <p className="modal-note">
        An approximate point is enough. Stored only in this browser, never sent
        to our server or included in shared links.
      </p>
      <button
        className="viewpoint-locate"
        disabled={locating}
        onClick={() => {
          if (!navigator.geolocation) {
            setError(
              'Location is unavailable. Enter an approximate point below.',
            );
            return;
          }
          setLocating(true);
          navigator.geolocation.getCurrentPosition(
            (position) => {
              setLocating(false);
              save(position.coords.latitude, position.coords.longitude);
            },
            () => {
              setLocating(false);
              setError(
                'Location was not available. You can enter coordinates instead.',
              );
            },
            {
              enableHighAccuracy: false,
              timeout: 10_000,
              maximumAge: 300_000,
            },
          );
        }}
      >
        {locating ? 'Finding your location…' : 'Use device location'}
      </button>
      <form
        onSubmit={(event) => {
          event.preventDefault();
          if (!lat.trim() || !lon.trim()) {
            setError('Enter both coordinates.');
            return;
          }
          save(Number(lat), Number(lon));
        }}
      >
        <div className="viewpoint-fields">
          <label>
            Latitude
            <input
              type="number"
              step="any"
              required
              value={lat}
              placeholder="42.38"
              onChange={(e) => setLat(e.target.value)}
            />
          </label>
          <label>
            Longitude
            <input
              type="number"
              step="any"
              required
              value={lon}
              placeholder="-70.98"
              onChange={(e) => setLon(e.target.value)}
            />
          </label>
        </div>
        <p className="modal-note">
          Coordinates are rounded to roughly a city block. Nearby means within 5
          miles and below 6,000 ft, plus recent runway transitions. This cannot
          identify a sound with certainty.
        </p>
        {error && (
          <p role="alert" className="viewpoint-error">
            {error}
          </p>
        )}
        <button type="submit" className="viewpoint-save">
          Watch near this point ↗
        </button>
      </form>
      {preferences.viewpoint && (
        <button
          className="viewpoint-forget"
          onClick={() => {
            onChange({ mode: 'airport', viewpoint: null });
            onClose();
          }}
        >
          Forget my viewing point
        </button>
      )}
    </ResponsiveDialog>
  );
}

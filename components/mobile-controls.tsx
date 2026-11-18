'use client';

import { airport, hasAirportMap } from '@/lib/airport';

import type { ComponentType, ReactNode } from 'react';
import {
  ArrowLeft,
  ArrowUpRight,
  Check,
  Headphones,
  Info,
  MapPin,
  MoreHorizontal,
  Pause,
  Radio,
  SlidersHorizontal,
  Tv,
  Wind,
} from 'lucide-react';
import { ResponsiveDialog } from './responsive-dialog';
import { HarborShortcut } from './harbor-shortcut';
import { RADIO_URL, HAS_TOWER } from '@/lib/radio';
import type { ObserverPreferences } from '@/lib/observer';
import type { WeatherSnapshot } from '@/lib/types';

export type PhonePanel = 'menu' | 'weather' | 'sound' | 'view' | null;
const titles = {
  menu: 'More ways to watch',
  weather: `${airport.city} weather`,
  sound: 'Set the atmosphere',
  view: 'Choose your view',
};

export function MobileControls({
  children,
  mobile,
  panel,
  setPanel,
  presentation,
  onTV,
  onReturn,
  harborVisible,
  harborUnavailable,
  onHarbor,
  onAbout,
  weather,
  weatherAge,
  temp,
  WeatherIcon,
  observer,
  onAirport,
  onNearby,
  onViewpoint,
  ambientOn,
  towerOn,
  towerConnecting,
  volume,
  setVolume,
  toggleAmbience,
  toggleTower,
  audioError,
  radioFailed,
  dismissError,
}: {
  children: ReactNode;
  mobile: boolean;
  panel: PhonePanel;
  setPanel: (panel: PhonePanel) => void;
  presentation: boolean;
  onTV: () => void;
  onReturn: () => void;
  harborVisible: boolean;
  harborUnavailable: string | null;
  onHarbor: () => void;
  onAbout: () => void;
  weather: WeatherSnapshot;
  weatherAge: string;
  temp: string;
  WeatherIcon: ComponentType<{ size?: number }>;
  observer: ObserverPreferences;
  onAirport: () => void;
  onNearby: () => void;
  onViewpoint: () => void;
  ambientOn: boolean;
  towerOn: boolean;
  towerConnecting: boolean;
  volume: number;
  setVolume: (value: number) => void;
  toggleAmbience: () => void;
  toggleTower: () => void;
  audioError: string | null;
  radioFailed: boolean;
  dismissError: () => void;
}) {
  const wind =
    weather.windSpeedKt === null
      ? 'Wind —'
      : `${Math.round(weather.windSpeedKt)} kt`;
  const towerActive = towerOn || towerConnecting;
  const error =
    audioError ?? (radioFailed ? 'Tower stream could not play.' : null);
  const act = (callback: () => void) => {
    setPanel(null);
    callback();
  };
  return (
    <>
      <header className="phone-only phone-header">
        <h1 aria-label={`${airport.brand.title}, ${airport.name}`}>
          <span aria-hidden="true">✳</span>{' '}
          {presentation ? airport.iata : airport.brand.wordmark}
          <span className="phone-period">.</span>
        </h1>
        <button
          className="phone-weather"
          onClick={() => setPanel('weather')}
          aria-label={`${airport.city} weather: ${temp}, ${weather.description || 'unavailable'}, ${wind}${weather.freshness === 'stale' ? ', stale observation' : ''}. View details`}
        >
          <WeatherIcon size={23} />
          <span>
            <strong>{temp}</strong>
            <small>
              <Wind size={12} />
              {weather.freshness === 'stale' ? 'Stale' : wind}
            </small>
          </span>
        </button>
        {hasAirportMap && mobile && presentation && (
          <HarborShortcut
            compact
            showing={harborVisible}
            unavailableReason={harborUnavailable}
            onToggle={onHarbor}
          />
        )}
        <button
          className={`phone-icon-button${presentation ? ' phone-tv-exit' : ''}`}
          onClick={presentation ? onReturn : () => setPanel('menu')}
          aria-label={presentation ? 'Return to phone view' : 'More options'}
        >
          {presentation ? (
            <>
              <ArrowLeft size={18} />
              <span>Exit TV</span>
            </>
          ) : (
            <MoreHorizontal size={24} />
          )}
        </button>
      </header>
      {children}
      <footer className="phone-only phone-dock" aria-label="Sound controls">
        {error && (
          <output className="phone-audio-error">
            <span>
              {error}{' '}
              {radioFailed && (
                <a href={RADIO_URL} target="_blank" rel="noreferrer">
                  Official player ↗
                </a>
              )}
            </span>
            <button onClick={dismissError} aria-label="Dismiss audio message">
              ×
            </button>
          </output>
        )}
        <div className="phone-dock-controls">
          <button
            className={ambientOn ? 'active' : ''}
            onClick={toggleAmbience}
            aria-pressed={ambientOn}
            aria-label={ambientOn ? 'Pause ambience' : 'Play ambience'}
          >
            {ambientOn ? <Pause size={18} /> : <Headphones size={18} />}
            <span>
              Ambience<small>{ambientOn ? 'Playing' : 'Tap to play'}</small>
            </span>
          </button>
          {HAS_TOWER && (
            <button
              className={towerActive ? 'active' : ''}
              onClick={toggleTower}
              aria-pressed={towerActive}
              aria-label={
                towerConnecting
                  ? 'Stop connecting to tower'
                  : towerOn
                    ? 'Pause tower'
                    : 'Play tower'
              }
            >
              {towerActive ? <Pause size={18} /> : <Radio size={18} />}
              <span>
                Tower
                <small>
                  {towerConnecting
                    ? 'Connecting…'
                    : towerOn
                      ? 'Playing'
                      : 'Live ATC'}
                </small>
              </span>
            </button>
          )}
          <button
            className="phone-icon-button"
            onClick={() => setPanel('sound')}
            aria-label="Sound settings"
          >
            <SlidersHorizontal size={20} />
          </button>
        </div>
      </footer>
      {mobile && panel && (
        <ResponsiveDialog
          mobile
          label={titles[panel]}
          onClose={() => setPanel(null)}
        >
          <h2>{titles[panel]}</h2>
          {panel === 'menu' && (
            <div className="phone-options">
              <button onClick={() => act(onTV)}>
                <Tv size={22} />
                <span>
                  TV Mode<small>Designed for a bigger screen</small>
                </span>
                <ArrowUpRight size={18} />
              </button>
              <button onClick={() => act(onAbout)}>
                <Info size={22} />
                <span>
                  About {airport.brand.title}
                  <small>A little window onto {airport.name}</small>
                </span>
                <ArrowUpRight size={18} />
              </button>
              <a
                href="https://juan.pemberthy.com"
                target="_blank"
                rel="noreferrer"
              >
                by jpemberthy <ArrowUpRight size={16} />
              </a>
            </div>
          )}
          {panel === 'weather' && (
            <>
              <div className="phone-weather-detail">
                <WeatherIcon size={44} />
                <strong>{temp}</strong>
              </div>
              <p>{weather.description || 'Waiting for weather'}</p>
              <p>
                <Wind size={16} /> {wind}
                {weather.windDirection !== null
                  ? ` · ${weather.windDirection}°`
                  : ''}
              </p>
              <p className="modal-note">
                {weather.freshness === 'unavailable'
                  ? 'No observation available.'
                  : `${weather.freshness === 'stale' ? 'Stale observation · ' : ''}Observed ${weatherAge}.`}{' '}
                NOAA weather observations at {airport.name} (
                {airport.weatherStation}), not a forecast.
              </p>
            </>
          )}
          {panel === 'view' && (
            <>
              <div className="phone-options">
                <button
                  onClick={() => act(onAirport)}
                  aria-pressed={observer.mode === 'airport'}
                >
                  <Tv size={22} />
                  <span>
                    Airport view
                    <small>Watch activity around {airport.name}</small>
                  </span>
                  {observer.mode === 'airport' && <Check size={20} />}
                </button>
                <button
                  onClick={() => act(onNearby)}
                  aria-pressed={observer.mode === 'nearby'}
                >
                  <MapPin size={22} />
                  <span>
                    Near me
                    <small>Spotlight flights near your viewing point</small>
                  </span>
                  {observer.mode === 'nearby' && <Check size={20} />}
                </button>
                {observer.viewpoint && (
                  <button onClick={() => act(onViewpoint)}>
                    <MapPin size={20} />
                    <span>Change or forget viewing point</span>
                    <ArrowUpRight size={18} />
                  </button>
                )}
              </div>
              <p className="modal-note">
                Your viewing point stays on this device. Nearby flights are
                possibilities, not sound identification.
              </p>
            </>
          )}
          {panel === 'sound' && (
            <>
              <p className="modal-note">
                Weather-shaped ambience.
                {HAS_TOWER &&
                  ' Optional live tower radio can play alongside it.'}
              </p>
              <div className="phone-options">
                <button onClick={toggleAmbience} aria-pressed={ambientOn}>
                  <Headphones size={22} />
                  <span>
                    Ambience
                    <small>
                      {ambientOn
                        ? 'Playing · tap to pause'
                        : 'Weather, wind, and airport sound cues'}
                    </small>
                  </span>
                  {ambientOn ? <Pause size={18} /> : <span>Play</span>}
                </button>
              </div>
              <label className="phone-volume">
                Ambience volume <output>{Math.round(volume * 100)}%</output>
                <input
                  type="range"
                  min="0"
                  max="100"
                  aria-label="Ambience volume"
                  value={Math.round(volume * 100)}
                  onChange={(e) => setVolume(Number(e.target.value) / 100)}
                />
              </label>
              <div className="phone-options">
                {HAS_TOWER && (
                  <button onClick={toggleTower} aria-pressed={towerActive}>
                    <Radio size={22} />
                    <span>
                      Tower radio
                      <small>
                        {towerConnecting
                          ? 'Connecting · tap to stop'
                          : towerOn
                            ? 'Playing · tap to pause'
                            : airport.tower?.label}
                      </small>
                    </span>
                    {towerActive ? <Pause size={18} /> : <span>Play</span>}
                  </button>
                )}
              </div>
              {HAS_TOWER && (
                <>
                  <p className="modal-note">
                    Use your phone’s volume buttons for tower radio.
                    Transmissions can have quiet gaps.
                  </p>
                  <a
                    className="phone-official"
                    href={RADIO_URL}
                    target="_blank"
                    rel="noreferrer"
                  >
                    Open LiveATC’s official player <ArrowUpRight size={16} />
                  </a>
                </>
              )}
              {error && (
                <p role="alert" className="viewpoint-error">
                  {error}
                </p>
              )}
            </>
          )}
        </ResponsiveDialog>
      )}
    </>
  );
}

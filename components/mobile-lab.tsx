'use client';

import {
  lazy,
  Suspense,
  useCallback,
  useEffect,
  useRef,
  useState,
  type ReactNode,
} from 'react';
import {
  ArrowLeft,
  ArrowRight,
  ArrowUpRight,
  Check,
  ChevronDown,
  ChevronRight,
  CloudSun,
  Headphones,
  Info,
  MapPin,
  MoreHorizontal,
  Pause,
  Play,
  Radio,
  SlidersHorizontal,
  Sparkles,
  Tv,
  Wind,
  X,
} from 'lucide-react';
import { MomentCard } from './moment-card';
import { MOMENT_ORDER } from '@/lib/flight-story';
import {
  mobilePreview,
  PREVIEW_NOW,
  PREVIEW_SCENARIOS,
  type PreviewScenario,
} from '@/lib/mobile-preview';

const ArcadeGlobe = lazy(() => import('./arcade-globe'));
type Sheet =
  | 'menu'
  | 'sound'
  | 'details'
  | 'about'
  | 'scenarios'
  | 'view'
  | 'weather'
  | null;
const sheetNames: Record<Exclude<Sheet, null>, string> = {
  menu: 'More ways to watch',
  sound: 'Set the atmosphere',
  details: 'Flight details',
  about: 'A window onto Logan',
  scenarios: 'Preview scenarios',
  view: 'Choose your view',
  weather: 'Boston weather',
};

function PreviewSheet({
  name,
  onClose,
  children,
}: {
  name: string;
  onClose: () => void;
  children: ReactNode;
}) {
  const dialog = useRef<HTMLDialogElement>(null);
  const closeButton = useRef<HTMLButtonElement>(null);
  useEffect(() => {
    const previous = document.activeElement as HTMLElement | null;
    const previousOverflow = document.body.style.overflow;
    const element = dialog.current!;
    element.showModal();
    document.body.style.overflow = 'hidden';
    closeButton.current?.focus();
    const onBackdropClick = (event: MouseEvent) => {
      if (event.target === element) onClose();
    };
    element.addEventListener('click', onBackdropClick);
    return () => {
      element.removeEventListener('click', onBackdropClick);
      element.close();
      document.body.style.overflow = previousOverflow;
      if (previous?.isConnected) previous.focus();
    };
  }, [onClose]);
  return (
    <dialog
      ref={dialog}
      className="ml-sheet"
      aria-label={name}
      onCancel={(event) => {
        event.preventDefault();
        onClose();
      }}
    >
      <div className="ml-sheet-inner">
        <div className="ml-sheet-top">
          <span className="ml-eyebrow">AIRPORT / DESIGN PREVIEW</span>
          <button
            ref={closeButton}
            className="ml-icon-button"
            onClick={onClose}
            aria-label={`Close ${name}`}
          >
            <X size={20} />
          </button>
        </div>
        <div className="ml-sheet-content">{children}</div>
      </div>
    </dialog>
  );
}

/** Isolated visual prototype: every interaction stays in React state. */
export function MobileLab() {
  const [index, setIndex] = useState(1);
  const [scenario, setScenario] = useState<PreviewScenario>('normal');
  const [nearby, setNearby] = useState(false);
  const [daytime, setDaytime] = useState(false);
  const [sheet, setSheet] = useState<Sheet>(null);
  const closeSheet = useCallback(() => setSheet(null), []);
  const [tv, setTv] = useState(false);
  const [ambience, setAmbience] = useState(false);
  const [tower, setTower] = useState(false);
  const [volume, setVolume] = useState(42);
  const [towerVolume, setTowerVolume] = useState(70);
  const data = mobilePreview(scenario, index, daytime);
  const { featured, route, moments, weather, atmosphere } = data;
  const cycle = (step: number) =>
    setIndex(
      (value) => (value + step + MOMENT_ORDER.length) % MOMENT_ORDER.length,
    );
  const showNearby = nearby || scenario === 'nearby';
  const setView = (value: boolean) => {
    setNearby(value);
    if (scenario === 'nearby' && !value) setScenario('normal');
  };
  const changeScenario = (value: PreviewScenario) => {
    setScenario(value);
    setNearby(value === 'nearby');
  };
  const flightTitle = featured
    ? `${featured.flight.airline.name} · ${route?.flightNumber ?? featured.flight.callsign}`
    : '';

  return (
    <main className={`mobile-lab${tv ? ' ml-tv' : ''}`}>
      <div className="ml-preview-flag">
        DESIGN PREVIEW <span>·</span> SAMPLE DATA / NO AUDIO
      </div>
      <header className="ml-header">
        <div className="ml-brand">
          <span className="ml-brand-mark" aria-hidden="true">
            ✳
          </span>
          <h1 aria-label="LoganWatch, Boston Logan">
            AIRPORT<span className="ml-period">.</span>
          </h1>
        </div>
        <button
          className="ml-weather-summary"
          onClick={() => setSheet('weather')}
          aria-label="Boston weather: 58 degrees, partly cloudy, wind 3 knots. View details"
        >
          <CloudSun size={23} />
          <span>
            <strong>58°</strong>
            <small>
              <Wind size={12} /> 3 kt
            </small>
          </span>
        </button>
        {tv ? (
          <button
            className="ml-icon-button"
            aria-label="Phone view"
            onClick={() => setTv(false)}
          >
            <ArrowLeft size={20} />
          </button>
        ) : (
          <button
            className="ml-icon-button"
            aria-label="More options"
            onClick={() => setSheet('menu')}
          >
            <MoreHorizontal size={24} />
          </button>
        )}
      </header>

      <div className="ml-body">
        {scenario === 'stale' && (
          <output className="ml-feed-note">
            Reconnecting · last sample position 2m ago
          </output>
        )}
        {tv && (
          <p className="ml-tv-note">
            <Tv size={15} /> TV mode · designed for a bigger screen
          </p>
        )}

        <section className="ml-flight" aria-label="Sample airport activity">
          <button
            className="ml-view-trigger"
            onClick={() => setSheet('view')}
            aria-label={`Viewing location: ${showNearby ? 'Near me' : 'Airport view'}. Change view`}
            aria-haspopup="dialog"
          >
            {showNearby && <MapPin size={13} />}
            {showNearby ? 'Near me' : 'Airport view'} <ChevronDown size={14} />
          </button>
          <MomentCard
            featured={featured}
            moments={moments}
            onCycle={cycle}
            onSelect={() => setSheet('details')}
            weather={weather}
            atmosphere={atmosphere}
            status="Live positions"
            now={PREVIEW_NOW}
            route={route}
            nearLabel={
              showNearby && featured
                ? 'About 1.6 mi W of your viewing point'
                : null
            }
          />
          <nav className="ml-flight-actions" aria-label="Browse sample flights">
            <button
              aria-label="Previous sample flight"
              disabled={!featured}
              onClick={() => cycle(-1)}
            >
              <ArrowLeft size={18} />
              <span>Previous</span>
            </button>
            <button
              className="ml-details-button"
              disabled={!featured}
              onClick={() => setSheet('details')}
            >
              Flight details <ArrowUpRight size={15} />
            </button>
            <button
              aria-label="Next sample flight"
              disabled={!featured}
              onClick={() => cycle(1)}
            >
              <span>Next</span>
              <ArrowRight size={18} />
            </button>
          </nav>
        </section>
        <div className="ml-under-flight">
          <span>
            {featured
              ? `${index + 1} of 5 sample moments`
              : 'A quiet moment at Logan'}
          </span>
          <span>Illustrative flight data</span>
        </div>
        {showNearby && (
          <section className="ml-recent" aria-label="Recently nearby">
            <div className="ml-section-heading">
              Recently nearby <span>Sample history</span>
            </div>
            {['B6152 · Landing', 'AA4724 · Taxi', 'TP217 · Approach'].map(
              (label, i) => (
                <button
                  key={label}
                  onClick={() => {
                    setIndex([1, 2, 0][i]);
                    if (scenario === 'quiet') setScenario('normal');
                    setSheet('details');
                  }}
                >
                  <span>
                    {label}
                    <small>
                      {i + 1}m ago · {i === 1 ? '0.9' : '1.6'} mi W
                    </small>
                  </span>
                  <ChevronRight size={17} />
                </button>
              ),
            )}
          </section>
        )}
        <footer className="ml-credit">
          <a href="https://juan.pemberthy.com" target="_blank" rel="noreferrer">
            by <strong>jpemberthy</strong> <ArrowUpRight size={12} />
          </a>
          <button onClick={() => setSheet('about')}>
            About this window <Info size={14} />
          </button>
        </footer>
      </div>

      <div className="ml-sound-dock" aria-label="Preview sound controls">
        <button
          className="ml-sound-toggle"
          aria-pressed={ambience}
          aria-label={`${ambience ? 'Pause' : 'Play'} ambience preview`}
          onClick={() => setAmbience(!ambience)}
        >
          {ambience ? <Pause size={19} /> : <Headphones size={19} />}
          <span>
            Ambience
            <small>
              {ambience ? 'On · preview only' : 'Weather & airport'}
            </small>
          </span>
        </button>
        <button
          className="ml-sound-toggle"
          aria-pressed={tower}
          aria-label={`${tower ? 'Pause' : 'Play'} tower preview`}
          onClick={() => setTower(!tower)}
        >
          {tower ? <Pause size={19} /> : <Radio size={19} />}
          <span>
            Tower
            <small>{tower ? 'On · preview only' : 'Air traffic radio'}</small>
          </span>
        </button>
        <button
          className="ml-icon-button ml-sound-settings"
          aria-label="Sound settings"
          onClick={() => setSheet('sound')}
        >
          <SlidersHorizontal size={20} />
        </button>
      </div>

      {sheet && (
        <PreviewSheet key={sheet} name={sheetNames[sheet]} onClose={closeSheet}>
          {sheet === 'menu' && (
            <>
              <h2>More ways to watch.</h2>
              <p className="ml-sheet-copy">A little window. A bigger screen.</p>
              <button
                className="ml-menu-item"
                onClick={() => {
                  setTv(true);
                  setSheet(null);
                }}
              >
                <Tv size={23} />
                <span>
                  TV mode<small>Designed for a bigger screen</small>
                </span>
                <ArrowUpRight size={19} />
              </button>
              <button
                className="ml-menu-item"
                onClick={() => setSheet('about')}
              >
                <Info size={23} />
                <span>
                  About Logan<small>The story behind this window</small>
                </span>
                <ChevronRight size={18} />
              </button>
              <button
                className="ml-menu-item ml-preview-menu"
                onClick={() => setSheet('scenarios')}
              >
                <SlidersHorizontal size={23} />
                <span>
                  Preview scenarios
                  <small>Test scenes, routes & screen states</small>
                </span>
                <ChevronRight size={18} />
              </button>
              <a
                className="ml-maker-link"
                href="https://juan.pemberthy.com"
                target="_blank"
                rel="noreferrer"
              >
                by jpemberthy <ArrowUpRight size={14} />
              </a>
            </>
          )}
          {sheet === 'view' && (
            <>
              <h2>Your window.</h2>
              <p className="ml-sheet-copy">
                Watch all of Logan, or the flights passing nearby.
              </p>
              <button
                className="ml-menu-item"
                aria-label="Airport view"
                aria-pressed={!showNearby}
                onClick={() => {
                  setView(false);
                  closeSheet();
                }}
              >
                <Sparkles size={23} />
                <span>
                  Airport view
                  <small>Arrivals, departures & everything between</small>
                </span>
                {!showNearby && <Check size={18} />}
              </button>
              <button
                className="ml-menu-item"
                aria-label="Near me"
                aria-pressed={showNearby}
                onClick={() => {
                  setView(true);
                  closeSheet();
                }}
              >
                <MapPin size={23} />
                <span>
                  Near me<small>Flights near your viewing point</small>
                </span>
                {showNearby && <Check size={18} />}
              </button>
              <p className="ml-small-note">
                Sample viewing point · Winthrop. This preview never requests
                your location.
              </p>
            </>
          )}
          {sheet === 'weather' && (
            <>
              <CloudSun className="ml-sheet-symbol" size={28} />
              <h2>Boston weather.</h2>
              <p className="ml-sheet-copy">Partly cloudy over Logan.</p>
              <dl className="ml-detail-stats">
                <div>
                  <dt>Temperature</dt>
                  <dd>58°F</dd>
                </div>
                <div>
                  <dt>Wind</dt>
                  <dd>3 kt</dd>
                </div>
              </dl>
              <p className="ml-small-note">
                Sample KBOS observation · 12 minutes ago. Weather also shapes
                the illustrated sky.
              </p>
            </>
          )}
          {sheet === 'sound' && (
            <>
              <Headphones className="ml-sheet-symbol" size={25} />
              <h2>Set the atmosphere.</h2>
              <p className="ml-sheet-copy">
                Two layers. Your kind of background.
              </p>
              <div className="ml-sound-layer">
                <div>
                  <h3>Ambience</h3>
                  <p>Weather & airport soundscape</p>
                </div>
                <button
                  className="ml-icon-button"
                  aria-label={`${ambience ? 'Pause' : 'Play'} ambience in sound settings`}
                  aria-pressed={ambience}
                  onClick={() => setAmbience(!ambience)}
                >
                  {ambience ? <Pause size={19} /> : <Play size={19} />}
                </button>
              </div>
              <label className="ml-volume">
                Ambience level <output>{volume}%</output>
                <input
                  type="range"
                  min="0"
                  max="100"
                  value={volume}
                  aria-label="Preview ambience volume"
                  onChange={(event) => setVolume(Number(event.target.value))}
                />
              </label>
              <div className="ml-sound-layer">
                <div>
                  <h3>Tower</h3>
                  <p>Boston air traffic radio</p>
                </div>
                <button
                  className="ml-icon-button"
                  aria-label={`${tower ? 'Pause' : 'Play'} tower in sound settings`}
                  aria-pressed={tower}
                  onClick={() => setTower(!tower)}
                >
                  {tower ? <Pause size={19} /> : <Radio size={19} />}
                </button>
              </div>
              <label className="ml-volume">
                Tower level <output>{towerVolume}%</output>
                <input
                  type="range"
                  min="0"
                  max="100"
                  value={towerVolume}
                  aria-label="Preview tower volume"
                  onChange={(event) =>
                    setTowerVolume(Number(event.target.value))
                  }
                />
              </label>
              <p className="ml-small-note">
                On iPhone, tower volume uses your phone’s volume buttons. These
                sliders preview the interface only.
              </p>
              <div className="ml-notice">
                <Sparkles size={16} />
                <span>Silent design preview. No audio is playing.</span>
              </div>
            </>
          )}
          {sheet === 'details' && featured && (
            <>
              <p className="ml-eyebrow ml-accent">
                {featured.moment.toUpperCase()} / SAMPLE FLIGHT
              </p>
              <h2 className="ml-flight-title">{flightTitle}</h2>
              {route && (
                <div className="ml-route-heading">
                  <div>
                    <strong>{route.origin.code}</strong>
                    <span>{route.origin.city}</span>
                  </div>
                  <ArrowRight size={23} />
                  <div>
                    <strong>{route.destination.code}</strong>
                    <span>{route.destination.city}</span>
                  </div>
                </div>
              )}
              <Suspense
                fallback={
                  <div className="ml-globe-placeholder">Boston & the world</div>
                }
              >
                <ArcadeGlobe route={route} />
              </Suspense>
              <dl className="ml-detail-stats">
                <div>
                  <dt>Aircraft</dt>
                  <dd>{featured.flight.aircraftType}</dd>
                </div>
                <div>
                  <dt>Callsign</dt>
                  <dd>{featured.flight.callsign}</dd>
                </div>
                <div>
                  <dt>Altitude</dt>
                  <dd>
                    {featured.flight.onGround
                      ? 'Ground'
                      : `${featured.flight.altitudeFt?.toLocaleString()} ft`}
                  </dd>
                </div>
                <div>
                  <dt>Speed</dt>
                  <dd>{featured.flight.speedKt} kt</dd>
                </div>
              </dl>
              {showNearby && (
                <p className="ml-sheet-copy">
                  <MapPin size={15} /> About 1.6 mi west of the sample viewing
                  point.
                </p>
              )}
              <p className="ml-small-note">
                {scenario === 'stale'
                  ? 'Last sample position 2 minutes ago.'
                  : 'Sample position updated 3 seconds ago.'}{' '}
                Illustrative data for layout review, not a current flight
                report.
              </p>
            </>
          )}
          {sheet === 'about' && (
            <>
              <span className="ml-about-mark" aria-hidden="true">
                ✳
              </span>
              <h2>The planes next door.</h2>
              <p className="ml-sheet-copy ml-tagline">The sky is always on.</p>
              <p className="ml-sheet-copy">
                I live next to Boston Logan. I hear the planes all day, so I
                made a little window into where they’re going.
              </p>
              <p className="ml-sheet-copy">
                Real movement, an arcade sky, and a softer place to watch.
              </p>
              <a
                className="ml-maker-link"
                href="https://juan.pemberthy.com"
                target="_blank"
                rel="noreferrer"
              >
                by jpemberthy <ArrowUpRight size={16} />
              </a>
              <div className="ml-notice">
                <Info size={17} />
                <span>
                  This is a design preview. Flights and nearby locations here
                  are examples; nothing is being tracked or played.
                </span>
              </div>
            </>
          )}
          {sheet === 'scenarios' && (
            <>
              <h2>Try the edges.</h2>
              <p className="ml-sheet-copy">
                Sample data only. No provider requests or saved preferences.
              </p>
              <label className="ml-select-label">
                Screen state
                <select
                  aria-label="Preview screen state"
                  value={scenario}
                  onChange={(event) =>
                    changeScenario(event.target.value as PreviewScenario)
                  }
                >
                  {Object.entries(PREVIEW_SCENARIOS).map(([value, label]) => (
                    <option key={value} value={value}>
                      {label}
                    </option>
                  ))}
                </select>
              </label>
              <label className="ml-select-label">
                Flight scene
                <select
                  aria-label="Preview flight scene"
                  value={index}
                  onChange={(event) => setIndex(Number(event.target.value))}
                >
                  {MOMENT_ORDER.map((moment, i) => (
                    <option key={moment} value={i}>
                      {moment}
                    </option>
                  ))}
                </select>
              </label>
              <button
                className="ml-menu-item"
                aria-pressed={daytime}
                onClick={() => setDaytime(!daytime)}
              >
                <CloudSun size={23} />
                <span>
                  Daylight artwork
                  <small>
                    {daytime ? 'Daytime palette' : 'Evening palette'}
                  </small>
                </span>
                {daytime && <Check size={18} />}
              </button>
              <button
                className="ml-primary-button"
                onClick={() => setSheet(null)}
              >
                View this preview <ArrowRight size={17} />
              </button>
            </>
          )}
        </PreviewSheet>
      )}
    </main>
  );
}

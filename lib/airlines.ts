import type { Airline } from './types';
export const UNKNOWN_AIRLINE: Airline = {
  code: '',
  name: 'Unidentified operator',
  color: '#c6d7d5',
  sprite: 6,
};
const definitions: [string, string, string, number][] = [
  ['JBU', 'jetBlue', '#65bdfb', 0],
  ['DAL', 'Delta Air Lines', '#f37d89', 1],
  ['AAL', 'American Airlines', '#b7c6d9', 2],
  ['UAL', 'United Airlines', '#78a7ef', 3],
  ['SWA', 'Southwest Airlines', '#f6bf63', 4],
  ['BAW', 'British Airways', '#dc8cad', 5],
  ['ASA', 'Alaska Airlines', '#7bd4b6', 6],
  ['FFT', 'Frontier Airlines', '#80c59d', 6],
  ['NKS', 'Spirit Airlines', '#e9d773', 6],
  ['RPA', 'Republic Airways', '#c9a9ee', 6],
  ['JIA', 'PSA Airlines', '#bec9e4', 6],
  ['ENY', 'Envoy Air', '#bec9e4', 6],
  ['SKW', 'SkyWest Airlines', '#c9b9e5', 6],
  ['EDV', 'Endeavor Air', '#f3a4ad', 1],
  ['FDX', 'FedEx Express', '#c79eeb', 6],
  ['UPS', 'UPS Airlines', '#d6b586', 6],
  ['ACA', 'Air Canada', '#ed9190', 6],
  ['POE', 'Porter Airlines', '#77c6d8', 6],
  ['AFR', 'Air France', '#a6b8f4', 6],
  ['DLH', 'Lufthansa', '#efc676', 6],
  ['SWR', 'Swiss', '#f1a09a', 6],
  ['KLM', 'KLM', '#5ec9ee', 6],
  ['TAP', 'TAP Air Portugal', '#94d89b', 6],
  ['EIN', 'Aer Lingus', '#81d8ae', 6],
  ['ICE', 'Icelandair', '#86b8e2', 6],
  ['VIR', 'Virgin Atlantic', '#dd83ab', 6],
  ['IBE', 'Iberia', '#ebaa82', 6],
  ['AZA', 'ITA Airways', '#85a8ed', 6],
  ['UAE', 'Emirates', '#e5c792', 6],
  ['QTR', 'Qatar Airways', '#cf90b2', 6],
  ['THY', 'Turkish Airlines', '#ee9b96', 6],
  ['JAL', 'Japan Airlines', '#eda4a0', 6],
  ['KAL', 'Korean Air', '#99d4ee', 6],
  ['CPA', 'Cathay Pacific', '#8dcdba', 6],
  ['ELY', 'El Al', '#98b9eb', 6],
  ['HAL', 'Hawaiian Airlines', '#dca9e9', 6],
  ['KAP', 'Cape Air', '#90cad4', 7],
  ['AMX', 'Aeroméxico', '#9bb6e9', 6],
  ['AAY', 'Allegiant Air', '#f2be8b', 6],
  ['PDT', 'Piedmont Airlines', '#b7c6d9', 6],
  ['JZA', 'Jazz Aviation', '#ed9190', 6],
  ['NPT', 'Norse Atlantic', '#9cafeb', 6],
  ['CFG', 'Condor', '#e5c77b', 6],
  ['SAS', 'Scandinavian Airlines', '#acc0f8', 6],
];
const airlines = new Map(
  definitions.map(([code, name, color, sprite]) => [
    code,
    { code, name, color, sprite },
  ]),
);
export function identifyAirline(callsign: string | null): Airline {
  const prefix = callsign
    ?.trim()
    .toUpperCase()
    .match(/^([A-Z]{3})(?=\d)/)?.[1];
  return prefix && airlines.has(prefix)
    ? airlines.get(prefix)!
    : UNKNOWN_AIRLINE;
}

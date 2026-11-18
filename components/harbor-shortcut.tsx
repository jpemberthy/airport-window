'use client';

import { useId } from 'react';
import { Map as MapIcon, PanelsTopLeft } from 'lucide-react';
import { airport } from '@/lib/airport';

export function HarborShortcut({
  showing,
  unavailableReason,
  onToggle,
  compact = false,
}: {
  showing: boolean;
  unavailableReason: string | null;
  onToggle: () => void;
  compact?: boolean;
}) {
  const id = useId();
  const reason = showing ? null : unavailableReason;
  const mapLabel = airport.map?.label ?? 'Harbor';
  const label = showing ? 'Back to stories' : `Show ${mapLabel.toLowerCase()}`;
  return (
    <>
      <button
        type="button"
        className={`harbor-shortcut ${compact ? 'harbor-shortcut-compact' : ''}`}
        onClick={onToggle}
        disabled={!!reason}
        aria-label={label}
        aria-describedby={reason ? id : undefined}
        title={reason ?? label}
      >
        {showing ? (
          <PanelsTopLeft size={17} aria-hidden="true" />
        ) : (
          <MapIcon size={17} aria-hidden="true" />
        )}
        <span>
          {compact
            ? showing
              ? 'Stories'
              : (airport.map?.shortLabel ?? mapLabel)
            : label}
        </span>
      </button>
      {reason && (
        <span id={id} className="harbor-shortcut-reason">
          {reason}
        </span>
      )}
    </>
  );
}

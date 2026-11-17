'use client';
import { airport } from '@/lib/airport';

import { useEffect, useLayoutEffect, useRef, type ReactNode } from 'react';
import { X } from 'lucide-react';

/** Native modal on phones; retain the existing desktop presentation. */
export function ResponsiveDialog({
  mobile,
  label,
  closeLabel = `Close ${label}`,
  className = '',
  onClose,
  children,
}: {
  mobile: boolean;
  label: string;
  closeLabel?: string;
  className?: string;
  onClose: () => void;
  children: ReactNode;
}) {
  const dialog = useRef<HTMLDialogElement>(null);
  const closeButton = useRef<HTMLButtonElement>(null);
  const close = useRef(onClose);
  useLayoutEffect(() => {
    close.current = onClose;
  });
  useEffect(() => {
    if (!mobile) return;
    const element = dialog.current!;
    const previous = document.activeElement as HTMLElement | null;
    const overflow = document.body.style.overflow;
    element.showModal();
    document.body.style.overflow = 'hidden';
    closeButton.current?.focus();
    const backdrop = (event: MouseEvent) => {
      if (event.target === element) close.current();
    };
    element.addEventListener('click', backdrop);
    return () => {
      element.removeEventListener('click', backdrop);
      element.close();
      document.body.style.overflow = overflow;
      if (previous?.isConnected) previous.focus();
    };
  }, [mobile]);

  const contents = (
    <>
      <div className={mobile ? 'phone-sheet-top' : undefined}>
        {mobile && (
          <span>
            {airport.brand.wordmark} / {label.toUpperCase()}
          </span>
        )}
        <button
          ref={closeButton}
          className="modal-close"
          onClick={onClose}
          aria-label={closeLabel}
        >
          <X size={20} />
        </button>
      </div>
      {children}
    </>
  );

  if (mobile)
    return (
      <dialog
        ref={dialog}
        className={`flight-modal phone-sheet ${className}`}
        aria-label={label}
        onCancel={(event) => {
          event.preventDefault();
          onClose();
        }}
      >
        <div className="phone-sheet-inner">{contents}</div>
      </dialog>
    );
  return (
    <div className="modal-scrim">
      <dialog
        open
        className={`flight-modal ${className}`}
        aria-modal="true"
        aria-label={label}
      >
        {contents}
      </dialog>
    </div>
  );
}

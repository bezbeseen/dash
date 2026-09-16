'use client';

import { useEffect, useRef, useState } from 'react';

type Props = {
  href: string;
  name: string;
  src?: string;
  placeholder?: string;
};

export function DriveFileThumb({ href, name, src, placeholder }: Props) {
  const imgRef = useRef<HTMLImageElement>(null);
  const [loaded, setLoaded] = useState(!src);

  useEffect(() => {
    if (!src) return;
    if (imgRef.current?.complete && imgRef.current.naturalWidth > 0) {
      setLoaded(true);
    }
  }, [src]);

  return (
    <a
      href={href}
      target="_blank"
      rel="noreferrer"
      className="drive-file-thumb"
      title={name}
      aria-busy={loaded ? undefined : true}
    >
      <span className={`drive-file-thumb-media${loaded ? ' is-loaded' : ''}`}>
        {!loaded ? (
          <span className="drive-file-thumb-overlay" aria-hidden="true">
            <span className="drive-file-thumb-spinner" />
          </span>
        ) : null}
        {src ? (
          // eslint-disable-next-line @next/next/no-img-element
          <img
            ref={imgRef}
            src={src}
            alt=""
            onLoad={() => setLoaded(true)}
            onError={() => setLoaded(true)}
          />
        ) : (
          <span className="drive-file-thumb-ph">{placeholder ?? 'File'}</span>
        )}
      </span>
      <span className="drive-file-thumb-name">{name}</span>
    </a>
  );
}

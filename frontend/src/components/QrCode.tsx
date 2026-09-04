import { useEffect, useState } from 'react';
import QRCode from 'qrcode';

/**
 * Error correction level M keeps the label readable after the scuffs and tape
 * that a real shelf label collects, without making the modules so dense that a
 * cheap printer smears them together.
 */
export function useQrDataUrl(value: string, size = 220): string | undefined {
  const [dataUrl, setDataUrl] = useState<string>();

  useEffect(() => {
    let active = true;
    QRCode.toDataURL(value, {
      errorCorrectionLevel: 'M',
      margin: 1,
      width: size,
      color: { dark: '#14201dff', light: '#ffffffff' },
    })
      .then((url) => {
        if (active) setDataUrl(url);
      })
      .catch(() => undefined);
    return () => {
      active = false;
    };
  }, [value, size]);

  return dataUrl;
}

export function QrCode({
  value,
  size = 220,
  alt,
}: {
  value: string;
  size?: number;
  alt: string;
}) {
  const dataUrl = useQrDataUrl(value, size);

  if (!dataUrl) {
    return <div className="skeleton" style={{ width: size, height: size, borderRadius: 8 }} />;
  }
  return <img src={dataUrl} width={size} height={size} alt={alt} />;
}

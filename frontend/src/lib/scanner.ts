/**
 * Label payload and a hook point for camera scanning.
 *
 * Today the desk is a handheld scanner (keyboard wedge): it types this payload
 * into the focused field and presses Enter. `/v1/scan` already accepts a code
 * or asset id, so a future camera can call the same lookup with whatever the
 * video decoder returns.
 */
export function assetScanPayload(asset: { code: string; assetId: string }): string {
  return asset.code || asset.assetId;
}

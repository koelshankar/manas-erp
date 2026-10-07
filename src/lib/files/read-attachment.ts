/**
 * Turns a file the person picked into something the demo can hold: a data URL
 * small enough for localStorage.
 *
 * A phone photograph is 3–6 MB, which would fill the demo's storage on its own,
 * so images are scaled to fit 1280 px and re-encoded as JPEG. That is also what
 * a real upload would do before sending a site photograph over a mobile
 * connection. PDFs cannot be shrunk, so they are held as they are and refused
 * past a size the demo can afford.
 *
 * Browser-only; nothing here is imported by a service.
 */

export type ReadFile = {
  file_name: string;
  content_type: string;
  /** Bytes of the stored form, not of the original. */
  size: number;
  data_url: string;
};

const MAX_EDGE = 1280;
const JPEG_QUALITY = 0.72;
/** A PDF past this is refused rather than half-stored: ~1.1 MB of binary. */
export const MAX_PDF_CHARS = 1_500_000;

export class UnreadableFileError extends Error {}

function readAsDataUrl(blob: Blob): Promise<string> {
  return new Promise((resolve, reject) => {
    const reader = new FileReader();
    reader.onload = () => resolve(String(reader.result));
    reader.onerror = () => reject(new UnreadableFileError("That file could not be read."));
    reader.readAsDataURL(blob);
  });
}

function loadImage(url: string): Promise<HTMLImageElement> {
  return new Promise((resolve, reject) => {
    const img = new Image();
    img.onload = () => resolve(img);
    img.onerror = () => reject(new UnreadableFileError("That photograph could not be opened."));
    img.src = url;
  });
}

/** The size a data URL's payload decodes to, in bytes. */
function bytesOf(dataUrl: string): number {
  const payload = dataUrl.slice(dataUrl.indexOf(",") + 1);
  return Math.floor((payload.length * 3) / 4);
}

/** A camera file often arrives as "image.jpg" every time; give it a stamp so two do not collide. */
function uniqueName(name: string, taken: ReadonlySet<string>): string {
  if (!taken.has(name)) return name;
  const dot = name.lastIndexOf(".");
  const stem = dot > 0 ? name.slice(0, dot) : name;
  const ext = dot > 0 ? name.slice(dot) : "";
  for (let n = 2; ; n += 1) {
    const candidate = `${stem} (${n})${ext}`;
    if (!taken.has(candidate)) return candidate;
  }
}

export async function readAttachmentFile(
  file: File,
  takenNames: ReadonlySet<string> = new Set(),
): Promise<ReadFile> {
  const name = uniqueName(file.name || "attachment", takenNames);

  if (file.type === "application/pdf") {
    const data_url = await readAsDataUrl(file);
    if (data_url.length > MAX_PDF_CHARS) {
      throw new UnreadableFileError(
        "That PDF is too large for the demo to keep (about 1 MB at most).",
      );
    }
    return { file_name: name, content_type: file.type, size: file.size, data_url };
  }

  if (file.type.startsWith("image/")) {
    const original = await readAsDataUrl(file);
    let img: HTMLImageElement;
    try {
      img = await loadImage(original);
    } catch {
      // HEIC and the like: the browser cannot draw it, so it cannot be shrunk
      // or previewed. Say so rather than store several megabytes of nothing.
      throw new UnreadableFileError(
        "This photograph is in a format the browser cannot open. Take it as JPEG, or choose another.",
      );
    }
    const scale = Math.min(1, MAX_EDGE / Math.max(img.naturalWidth, img.naturalHeight));
    const canvas = document.createElement("canvas");
    canvas.width = Math.max(1, Math.round(img.naturalWidth * scale));
    canvas.height = Math.max(1, Math.round(img.naturalHeight * scale));
    const ctx = canvas.getContext("2d");
    if (!ctx) throw new UnreadableFileError("That photograph could not be processed.");
    // A transparent PNG would turn black as a JPEG.
    ctx.fillStyle = "#ffffff";
    ctx.fillRect(0, 0, canvas.width, canvas.height);
    ctx.drawImage(img, 0, 0, canvas.width, canvas.height);
    const data_url = canvas.toDataURL("image/jpeg", JPEG_QUALITY);
    const jpgName = name.replace(/\.[^.]+$/, "") + ".jpg";
    return {
      file_name: takenNames.has(jpgName) ? uniqueName(jpgName, takenNames) : jpgName,
      content_type: "image/jpeg",
      size: bytesOf(data_url),
      data_url,
    };
  }

  throw new UnreadableFileError("Attach a photograph or a PDF.");
}

/** Opens a stored PDF in a new tab. A `data:` URL cannot be navigated to directly, so go through a Blob. */
export function openDataUrl(dataUrl: string): void {
  const [meta, payload] = [dataUrl.slice(0, dataUrl.indexOf(",")), dataUrl.slice(dataUrl.indexOf(",") + 1)];
  const type = meta.slice(5).split(";")[0] || "application/octet-stream";
  const bin = atob(payload);
  const bytes = new Uint8Array(bin.length);
  for (let i = 0; i < bin.length; i += 1) bytes[i] = bin.charCodeAt(i);
  const url = URL.createObjectURL(new Blob([bytes], { type }));
  window.open(url, "_blank", "noopener");
  setTimeout(() => URL.revokeObjectURL(url), 60_000);
}

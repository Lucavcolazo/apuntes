import * as pdfjs from 'pdfjs-dist';
import workerUrl from 'pdfjs-dist/build/pdf.worker.min.mjs?url';

pdfjs.GlobalWorkerOptions.workerSrc = workerUrl;

export { pdfjs };
export type { PDFDocumentProxy, PDFPageProxy } from 'pdfjs-dist';

const base = import.meta.env.BASE_URL;

export async function loadPdf(source: Blob | ArrayBuffer) {
  const buf = source instanceof Blob ? await source.arrayBuffer() : source.slice(0);
  return pdfjs.getDocument({
    data: new Uint8Array(buf),
    cMapUrl: `${base}pdfjs/cmaps/`,
    cMapPacked: true,
    standardFontDataUrl: `${base}pdfjs/standard_fonts/`,
    wasmUrl: `${base}pdfjs/wasm/`,
    iccUrl: `${base}pdfjs/iccs/`,
  }).promise;
}

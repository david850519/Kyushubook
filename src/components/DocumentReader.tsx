import { useEffect, useRef, useState } from "react";
import {
  ChevronLeft,
  ChevronRight,
  LoaderCircle,
  Minus,
  Plus,
} from "lucide-react";
import {
  getDocument,
  GlobalWorkerOptions,
  type PDFDocumentProxy,
} from "pdfjs-dist";
import workerUrl from "pdfjs-dist/build/pdf.worker.min.mjs?url";
import { fromBase64, type TravelAsset } from "../lib/travel";

GlobalWorkerOptions.workerSrc = workerUrl;

export default function DocumentReader({ asset }: { asset: TravelAsset }) {
  const container = useRef<HTMLDivElement>(null);
  const canvas = useRef<HTMLCanvasElement>(null);
  const [document, setDocument] = useState<PDFDocumentProxy | null>(null);
  const [pageNumber, setPageNumber] = useState(1);
  const [zoom, setZoom] = useState(1);
  const [width, setWidth] = useState(320);
  const [rendering, setRendering] = useState(true);
  const [error, setError] = useState("");

  useEffect(() => {
    const task = getDocument({
      data: fromBase64(asset.data),
      standardFontDataUrl: `${import.meta.env.BASE_URL}pdf-fonts/`,
    });
    let cancelled = false;
    void task.promise
      .then((loaded) => {
        if (!cancelled) setDocument(loaded);
      })
      .catch(() => {
        if (!cancelled) setError("PDF 無法開啟，請重新匯入完整附件。");
      });
    return () => {
      cancelled = true;
      void task.destroy();
    };
  }, [asset]);

  useEffect(() => {
    const element = container.current;
    if (!element) return;
    const observer = new ResizeObserver(() =>
      setWidth(Math.max(200, element.clientWidth - 32)),
    );
    observer.observe(element);
    return () => observer.disconnect();
  }, []);

  useEffect(() => {
    if (!document || !canvas.current) return;
    let cancelled = false;
    let cancelRender: (() => void) | undefined;
    setRendering(true);
    void document
      .getPage(pageNumber)
      .then(async (page) => {
        if (cancelled || !canvas.current) return;
        const context = canvas.current.getContext("2d");
        if (!context) throw new Error("Canvas unavailable");
        const viewport = page.getViewport({ scale: 1 });
        const scale = (width / viewport.width) * zoom;
        const displayViewport = page.getViewport({ scale });
        const pixelRatio = Math.min(devicePixelRatio || 1, 2);
        canvas.current.width = Math.floor(displayViewport.width * pixelRatio);
        canvas.current.height = Math.floor(displayViewport.height * pixelRatio);
        canvas.current.style.width = `${displayViewport.width}px`;
        canvas.current.style.height = `${displayViewport.height}px`;
        const task = page.render({
          canvas: canvas.current,
          canvasContext: context,
          viewport: displayViewport,
          transform: [pixelRatio, 0, 0, pixelRatio, 0, 0],
        });
        cancelRender = () => task.cancel();
        await task.promise;
        if (!cancelled) setRendering(false);
      })
      .catch((failure: unknown) => {
        if (
          !cancelled &&
          !(
            failure instanceof Error &&
            failure.name === "RenderingCancelledException"
          )
        )
          setError("PDF 顯示失敗，請重試。");
      });
    return () => {
      cancelled = true;
      cancelRender?.();
    };
  }, [document, pageNumber, zoom, width]);

  return (
    <div className="pdf-reader">
      <div className="reader-tools">
        <span>
          {pageNumber} / {document?.numPages ?? "…"}
        </span>
        {document && document.numPages > 1 && (
          <>
            <button
              className="icon-button"
              title="上一頁"
              aria-label="上一頁"
              disabled={pageNumber === 1}
              onClick={() => setPageNumber(pageNumber - 1)}
            >
              <ChevronLeft />
            </button>
            <button
              className="icon-button"
              title="下一頁"
              aria-label="下一頁"
              disabled={pageNumber === document.numPages}
              onClick={() => setPageNumber(pageNumber + 1)}
            >
              <ChevronRight />
            </button>
          </>
        )}
        <div className="grow" />
        <button
          className="icon-button"
          title="縮小"
          aria-label="縮小"
          disabled={zoom <= 0.75}
          onClick={() => setZoom(Math.max(0.75, zoom - 0.25))}
        >
          <Minus />
        </button>
        <span className="zoom-label">{Math.round(zoom * 100)}%</span>
        <button
          className="icon-button"
          title="放大"
          aria-label="放大"
          disabled={zoom >= 2}
          onClick={() => setZoom(Math.min(2, zoom + 0.25))}
        >
          <Plus />
        </button>
      </div>
      {error ? (
        <p className="error-message" role="alert">
          {error}
        </p>
      ) : (
        <div ref={container} className="pdf-stage" aria-busy={rendering}>
          {rendering && (
            <span className="pdf-loading">
              <LoaderCircle className="spin" /> 讀取附件
            </span>
          )}
          <canvas
            ref={canvas}
            aria-label={`${asset.name}第 ${pageNumber} 頁`}
            role="img"
            data-rendered={!rendering}
          />
        </div>
      )}
    </div>
  );
}

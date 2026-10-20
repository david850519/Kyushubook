import { mkdir, writeFile, access, cp } from "node:fs/promises";
import { fileURLToPath } from "node:url";
import { PDFDocument, StandardFonts, rgb } from "pdf-lib";
import { chromium } from "@playwright/test";
import { createElement } from "react";
import { renderToStaticMarkup } from "react-dom/server";
import { BookOpen } from "lucide-react";

const publicDirectory = fileURLToPath(new URL("../public/", import.meta.url));
await mkdir(`${publicDirectory}/demo`, { recursive: true });
const photoPath = `${publicDirectory}/demo/kumamoto.jpg`;
try {
  await access(photoPath);
} catch {
  const response = await fetch(
    "https://upload.wikimedia.org/wikipedia/commons/thumb/7/71/Kumamoto_Castle_03n4272.jpg/1280px-Kumamoto_Castle_03n4272.jpg",
    {
      headers: {
        "User-Agent":
          "KyushuTravelBookDemo/1.0 (local non-commercial prototype)",
      },
    },
  );
  if (!response.ok)
    throw new Error(`Photo download failed: ${response.status}`);
  const bytes = new Uint8Array(await response.arrayBuffer());
  if (bytes[0] !== 255 || bytes[1] !== 216)
    throw new Error("Photo is not a JPEG");
  await writeFile(photoPath, bytes);
}

const document = await PDFDocument.create();
const page = document.addPage([420, 560]);
const font = await document.embedFont(StandardFonts.Helvetica);
const bold = await document.embedFont(StandardFonts.HelveticaBold);
const green = rgb(0.24, 0.39, 0.32);
page.drawRectangle({
  x: 0,
  y: 0,
  width: 420,
  height: 560,
  color: rgb(0.98, 0.99, 0.98),
});
page.drawRectangle({ x: 30, y: 440, width: 360, height: 90, color: green });
page.drawText("KYUSHU / TRAVEL NOTES", {
  x: 50,
  y: 495,
  size: 13,
  font: bold,
  color: rgb(1, 1, 1),
});
page.drawText("A LITTLE JOURNEY", {
  x: 50,
  y: 464,
  size: 24,
  font: bold,
  color: rgb(1, 1, 1),
});
page.drawText("SAMPLE DOCUMENT", {
  x: 40,
  y: 388,
  size: 25,
  font: bold,
  color: green,
});
for (const [index, line] of [
  "Kumamoto / Day 01",
  "Date: 2027-04-12 (fictional)",
  "Reference: DEMO-ONLY",
  "Guests: 2 (sample)",
  "No real booking or personal information.",
].entries()) {
  page.drawText(line, {
    x: 40,
    y: 340 - index * 32,
    size: 13,
    font,
    color: green,
  });
}
page.drawLine({
  start: { x: 40, y: 150 },
  end: { x: 380, y: 150 },
  thickness: 1,
  color: rgb(0.8, 0.84, 0.8),
});
page.drawText("NOT VALID FOR ENTRY", {
  x: 40,
  y: 116,
  size: 19,
  font: bold,
  color: rgb(0.7, 0.35, 0.4),
});
page.drawText("Offline PDF rendering sample. No ticket barcode.", {
  x: 40,
  y: 87,
  size: 11,
  font,
  color: green,
});
await writeFile(
  `${publicDirectory}/demo/sample-ticket.pdf`,
  await document.save(),
);
await cp(
  fileURLToPath(
    new URL("../node_modules/pdfjs-dist/standard_fonts/", import.meta.url),
  ),
  `${publicDirectory}/pdf-fonts`,
  { recursive: true },
);

const browser = await chromium.launch({ channel: "msedge", headless: true });
try {
  const iconPage = await browser.newPage();
  const book = renderToStaticMarkup(
    createElement(BookOpen, { size: "52%", strokeWidth: 1.2 }),
  );
  await iconPage.setContent(
    `<html><style>*{box-sizing:border-box}body{margin:0;background:#456953;color:#fff;width:100vw;height:100vh;display:flex;align-items:center;justify-content:center;flex-direction:column;gap:6%;font-family:serif}span{font-size:12vw}svg{height:52%}</style><body>${book}<span>九州</span></body></html>`,
  );
  for (const size of [192, 512]) {
    await iconPage.setViewportSize({ width: size, height: size });
    await iconPage.screenshot({ path: `${publicDirectory}/icon-${size}.png` });
  }
} finally {
  await browser.close();
}
console.log(
  "PASS: public sample photo, fictional PDF and local PWA icons generated; no private PDF read.",
);

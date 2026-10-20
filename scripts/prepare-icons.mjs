import assert from "node:assert/strict";
import { readFile, writeFile } from "node:fs/promises";
import { chromium } from "@playwright/test";

const source = await readFile(
  new URL("../src/assets/app-icon-source.png", import.meta.url),
);
const targets = [
  { size: 180, filename: "apple-touch-icon.png" },
  { size: 192, filename: "icon-192.png" },
  { size: 512, filename: "icon-512.png" },
];
const browser = await chromium.launch({ channel: "msedge", headless: true });
try {
  const page = await browser.newPage();
  const icons = await page.evaluate(async ({ data, targets }) => {
    const image = new Image();
    image.src = `data:image/png;base64,${data}`;
    await image.decode();
    return targets.map(({ size, filename }) => {
      const canvas = document.createElement("canvas");
      canvas.width = size;
      canvas.height = size;
      const context = canvas.getContext("2d");
      context.imageSmoothingQuality = "high";
      context.drawImage(image, 0, 0, size, size);
      const pixels = context.getImageData(0, 0, size, size).data;
      let opaque = true;
      for (let offset = 3; offset < pixels.length; offset += 4) {
        if (pixels[offset] !== 255) opaque = false;
      }
      return { filename, opaque, png: canvas.toDataURL("image/png").split(",")[1] };
    });
  }, { data: source.toString("base64"), targets });
  for (const icon of icons) {
    assert.ok(icon.opaque, "Home screen icons must have an opaque background.");
    await writeFile(
      new URL(`../public/${icon.filename}`, import.meta.url),
      Buffer.from(icon.png, "base64"),
    );
  }
  console.log("PASS: selected road-trip icon generated at 180, 192 and 512 px; opaque backgrounds verified.");
} finally {
  await browser.close();
}
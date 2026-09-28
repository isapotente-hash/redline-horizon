import { readFile, writeFile } from "node:fs/promises";
import path from "node:path";
const root = path.resolve("dist");
let html = await readFile(path.join(root, "index.html"), "utf8");
const js = html.match(/<script\b[^>]*src="([^"]+)"[^>]*><\/script>/);
if (!js) throw Error("Built module script not found");
const code = await readFile(path.join(root, js[1]), "utf8");
html = html.replace(
  js[0],
  () =>
    '<script type="module">' +
    code.replace(/<\/script/gi, "<\\/script") +
    "</script>",
);
const styles = [
  ...html.matchAll(/<link\b[^>]*rel="stylesheet"[^>]*href="([^"]+)"[^>]*>/g),
];
for (const match of styles) {
  const css = await readFile(path.join(root, match[1]), "utf8");
  html = html.replace(match[0], () => "<style>" + css + "</style>");
}
const favicon = await readFile("public/favicon.svg", "utf8");
html = html.replace(
  /href="[^"]*favicon\.svg"/g,
  () =>
    `href="data:image/svg+xml;base64,${Buffer.from(favicon).toString("base64")}"`,
);
const logo=await readFile("public/redline-logo.png");
html=html.replace(/src="[^"]*redline-logo\.png"/g,()=>`src="data:image/png;base64,${logo.toString("base64")}"`);
const filename = path.join(root, "Redline-Horizon-Offline.html");
await writeFile(filename, html);
console.log(
  "Offline build:",
  filename,
  (Buffer.byteLength(html) / 1048576).toFixed(2) + " MiB",
);

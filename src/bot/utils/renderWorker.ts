import { parentPort } from "worker_threads";
import satori from "satori";
import { Resvg } from "@resvg/resvg-js";
import { loadFonts } from "../../fonts";

if (!parentPort) throw new Error("renderWorker.ts must run inside a worker_thread");

interface RenderJob {
  id: number;
  root: unknown;
  width: number;
  height?: number;
}

parentPort.on("message", async (job: RenderJob) => {
  try {
    const fonts = await loadFonts();
    const options: { width: number; height?: number; fonts: typeof fonts } = { width: job.width, fonts };
    if (typeof job.height === "number") options.height = job.height;
    const svg = await satori(job.root as never, options as never);
    const png = new Resvg(svg, { fitTo: { mode: "width", value: job.width * 2 } }).render().asPng();
    parentPort!.postMessage({ id: job.id, ok: true, png });
  } catch (e) {
    parentPort!.postMessage({ id: job.id, ok: false, error: e instanceof Error ? e.message : String(e) });
  }
});

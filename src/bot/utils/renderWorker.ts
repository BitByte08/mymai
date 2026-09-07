import { parentPort } from "worker_threads";
import satori from "satori";
import { Resvg } from "@resvg/resvg-js";
import { loadFonts, FONT_STACK } from "../../fonts";

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
    // 모든 카드가 폴백 스택을 타도록 root에 한 번만 지정한다 (자식은 상속).
    // 카드별로 지정하면 새 카드에서 빠뜨리기 쉬워 렌더 진입점에서 보장한다.
    const root = job.root as { props?: { style?: Record<string, unknown> } };
    if (root?.props?.style && root.props.style.fontFamily === undefined) {
      root.props.style.fontFamily = FONT_STACK;
    }
    const options: { width: number; height?: number; fonts: typeof fonts } = { width: job.width, fonts };
    if (typeof job.height === "number") options.height = job.height;
    const svg = await satori(root as never, options as never);
    const png = new Resvg(svg, { fitTo: { mode: "width", value: job.width * 2 } }).render().asPng();
    parentPort!.postMessage({ id: job.id, ok: true, png });
  } catch (e) {
    parentPort!.postMessage({ id: job.id, ok: false, error: e instanceof Error ? e.message : String(e) });
  }
});

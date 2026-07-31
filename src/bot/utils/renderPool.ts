import { Worker } from "worker_threads";
import * as path from "path";

// satori(layout)+resvg(rasterize) are synchronous CPU work; running them on the
// main thread blocks the Discord gateway/web event loop long enough for other
// users' interactions to time out. Offload to a small worker pool instead.
// ponytail: fixed pool size, bump or make it configurable if the render queue backs up.
const POOL_SIZE = 2;

const ext = path.extname(__filename); // ".js" under dist (prod), ".ts" under ts-node (dev)
const workerPath = path.join(__dirname, "renderWorker" + ext);
const workerOptions = ext === ".ts" ? { execArgv: ["-r", "ts-node/register/transpile-only"] } : {};

interface PendingJob {
  resolve: (buf: Buffer) => void;
  reject: (err: Error) => void;
}

interface Slot {
  worker: Worker;
  jobIds: Set<number>;
}

const slots: Slot[] = [];
let nextSlotIdx = 0;
let nextJobId = 0;
const pending = new Map<number, PendingJob>();

function spawn(index: number): Slot {
  const worker = new Worker(workerPath, workerOptions);
  const slot: Slot = { worker, jobIds: new Set() };
  worker.on("message", (msg: { id: number; ok: boolean; png?: Uint8Array; error?: string }) => {
    slot.jobIds.delete(msg.id);
    const job = pending.get(msg.id);
    if (!job) return;
    pending.delete(msg.id);
    if (msg.ok) job.resolve(Buffer.from(msg.png!));
    else job.reject(new Error(msg.error));
  });
  worker.on("error", (err) => console.error("[render-pool] worker error:", err));
  // A crashed worker leaves its in-flight jobs unresolved forever, which would
  // reintroduce the exact "no response" symptom this pool exists to fix.
  // Reject them and respawn so the pool self-heals.
  worker.on("exit", (code) => {
    console.error(`[render-pool] worker exited (code ${code}), respawning`);
    for (const id of slot.jobIds) {
      pending.get(id)?.reject(new Error("render worker exited"));
      pending.delete(id);
    }
    slots[index] = spawn(index);
  });
  return slot;
}

function pool(): Slot[] {
  if (slots.length) return slots;
  for (let i = 0; i < POOL_SIZE; i++) slots.push(spawn(i));
  return slots;
}

export function renderInWorker(root: unknown, width: number, height?: number): Promise<Buffer> {
  const list = pool();
  const slot = list[nextSlotIdx];
  nextSlotIdx = (nextSlotIdx + 1) % list.length;
  const id = nextJobId++;
  slot.jobIds.add(id);
  return new Promise((resolve, reject) => {
    pending.set(id, { resolve, reject });
    slot.worker.postMessage({ id, root, width, height });
  });
}

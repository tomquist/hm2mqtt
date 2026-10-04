// Preloaded into the measured process (`node --require`). Reports V8 heap
// figures the harness cannot read from /proc: one marker-prefixed JSON line
// per second on stderr, which the application itself does not log to.
const fs = require('node:fs');
const v8 = require('node:v8');

const MARKER = '@@hm2mqtt-memory-probe ';

const timer = setInterval(() => {
  const usage = process.memoryUsage();
  const heap = v8.getHeapStatistics();
  const line = JSON.stringify({
    t: Date.now(),
    heapUsed: usage.heapUsed,
    heapTotal: usage.heapTotal,
    external: usage.external,
    arrayBuffers: usage.arrayBuffers,
    mallocedMemory: heap.malloced_memory,
  });
  try {
    fs.writeSync(2, `${MARKER}${line}\n`);
  } catch {
    clearInterval(timer);
  }
}, 1000);
timer.unref();

// Preloaded into the measured process (`node --require`). Reports V8 heap
// figures the harness cannot read from /proc, one JSON line per second on a
// dedicated file descriptor so it never mixes with the application's own logs.
const fs = require('node:fs');
const v8 = require('node:v8');

const fd = Number(process.env.HM2MQTT_MEMORY_PROBE_FD);
if (Number.isInteger(fd) && fd > 2) {
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
      fs.writeSync(fd, line + '\n');
    } catch {
      clearInterval(timer);
    }
  }, 1000);
  timer.unref();
}

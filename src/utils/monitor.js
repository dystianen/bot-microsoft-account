class ResourceMonitor {
  constructor() {
    this.startTime = Date.now();
    this.lastCheck = Date.now();
    this.samples = [];
  }

  getCurrentUsage() {
    const usage = process.memoryUsage();
    const cpuUsage = process.cpuUsage();

    return {
      timestamp: Date.now(),
      memory: {
        rss: Math.round(usage.rss / 1024 / 1024), // MB
        heapUsed: Math.round(usage.heapUsed / 1024 / 1024),
        heapTotal: Math.round(usage.heapTotal / 1024 / 1024),
        external: Math.round(usage.external / 1024 / 1024),
      },
      cpu: {
        user: Math.round(cpuUsage.user / 1000), // ms
        system: Math.round(cpuUsage.system / 1000),
      },
      uptime: Math.round((Date.now() - this.startTime) / 1000),
    };
  }

  logDelta() {
    const current = this.getCurrentUsage();
    const elapsed = Math.round((current.timestamp - this.lastCheck) / 1000);

    console.log(
      `[MONITOR] Memory: ${current.memory.rss}MB (heap: ${current.memory.heapUsed}/${current.memory.heapTotal}MB) | ` +
        `Uptime: ${current.uptime}s | ` +
        `CPU: user=${current.cpu.user}ms system=${current.cpu.system}ms (${elapsed}s window)`
    );

    this.lastCheck = current.timestamp;
    this.samples.push(current);

    // Keep only last 100 samples (for alerting)
    if (this.samples.length > 100) {
      this.samples.shift();
    }
  }

  getStats() {
    if (this.samples.length === 0) return null;

    const heaps = this.samples.map((s) => s.memory.heapUsed);
    const avgHeap = Math.round(heaps.reduce((a, b) => a + b) / heaps.length);
    const maxHeap = Math.max(...heaps);

    return {
      avgHeapUsed: avgHeap,
      maxHeapUsed: maxHeap,
      sampleCount: this.samples.length,
      uptime: this.samples[this.samples.length - 1].uptime,
    };
  }
}

module.exports = new ResourceMonitor();

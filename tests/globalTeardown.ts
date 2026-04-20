// Global teardown for all tests
export default async function globalTeardown() {
  // Force clear all timers and intervals
  const timerId = setTimeout(() => {}, 0);
  for (let i = 1; i < timerId + 100; i++) {
    clearTimeout(i);
    clearInterval(i);
  }
  
  // Close any remaining handles
  if (global.gc) {
    global.gc();
  }
  
  // Small delay to allow cleanup
  await new Promise(resolve => setTimeout(resolve, 100));
  
  console.log('Global test teardown complete');
}

// Demo mode shows the screens with sample figures before real data exists.
// It only works in development, never in a production build.
export function isDemo() {
  return process.env.NODE_ENV !== "production" && process.env.DEMO_MODE === "1";
}

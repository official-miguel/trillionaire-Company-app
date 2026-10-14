import type { MetadataRoute } from "next";

// Lets people install the app from the browser ("Install app" / "Add to Home
// Screen"). It opens on the calendar, the page people use every day.
export default function manifest(): MetadataRoute.Manifest {
  return {
    name: "Trillionaire Designs",
    short_name: "Trillionaire",
    description: "Calendar, planning, ledgers and pay for Trillionaire Designs and Bidii.",
    id: "/",
    start_url: "/calendar",
    scope: "/",
    display: "standalone",
    background_color: "#ffffff",
    theme_color: "#ffffff",
    icons: [
      { src: "/icons/icon-192.png", sizes: "192x192", type: "image/png" },
      { src: "/icons/icon-512.png", sizes: "512x512", type: "image/png" },
      { src: "/icons/maskable-512.png", sizes: "512x512", type: "image/png", purpose: "maskable" },
    ],
    shortcuts: [
      { name: "Calendar", url: "/calendar", icons: [{ src: "/icons/icon-192.png", sizes: "192x192" }] },
      { name: "Home", url: "/" },
      { name: "Ask for money", url: "/requests" },
    ],
  };
}

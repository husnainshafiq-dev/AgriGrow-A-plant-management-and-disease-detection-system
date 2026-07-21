import { defineConfig } from "vite";
import react from "@vitejs/plugin-react";
import { VitePWA } from "vite-plugin-pwa";

export default defineConfig({
    plugins: [
        react(),
        VitePWA({
            registerType: "autoUpdate",
            includeAssets: ["icon.svg"],
            manifest: {
                name: "AgriGrow - AI Crop Doctor",
                short_name: "AgriGrow",
                description: "Offline-capable AI-powered crop disease diagnosis with treatment recommendations",
                theme_color: "#0a0f0d",
                background_color: "#0a0f0d",
                display: "standalone",
                orientation: "portrait",
                start_url: "/",
                icons: [
                    {
                        src: "/icon-192.png",
                        sizes: "192x192",
                        type: "image/png",
                    },
                    {
                        src: "/icon-512.png",
                        sizes: "512x512",
                        type: "image/png",
                        purpose: "any maskable",
                    },
                ],
            },
            workbox: {
                globPatterns: ["**/*.{js,css,html,svg,png,woff2}"],
                maximumFileSizeToCacheInBytes: 15 * 1024 * 1024,
                runtimeCaching: [
                    {
                        urlPattern: /\/model\/.*/i,
                        handler: "CacheFirst",
                        options: {
                            cacheName: "tfjs-model-cache",
                            expiration: {
                                maxEntries: 20,
                                maxAgeSeconds: 60 * 60 * 24 * 30,
                            },
                        },
                    },
                    {
                        urlPattern: /^https:\/\/fonts\.googleapis\.com\/.*/i,
                        handler: "StaleWhileRevalidate",
                        options: { cacheName: "google-fonts-stylesheets" },
                    },
                    {
                        urlPattern: /^https:\/\/fonts\.gstatic\.com\/.*/i,
                        handler: "CacheFirst",
                        options: {
                            cacheName: "google-fonts-webfonts",
                            expiration: {
                                maxEntries: 20,
                                maxAgeSeconds: 60 * 60 * 24 * 365,
                            },
                        },
                    },
                ],
            },
        }),
    ],
    server: {
        port: 3000,
        proxy: {
            "/api": "http://localhost:5000",
        },
    },
    build: {
        outDir: "dist",
    },
});

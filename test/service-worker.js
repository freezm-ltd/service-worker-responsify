import { Responser } from "./index.js"

self.addEventListener("install", () => {
  self.skipWaiting();
});

Responser.activate()
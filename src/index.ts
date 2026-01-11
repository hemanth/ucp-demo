/**
 * Firebase Function Entry Point
 *
 * Exports the Hono app as a Firebase Function for deployment.
 */

import { onRequest } from "firebase-functions/v2/https";
import { Hono } from "hono";
import { cors } from "hono/cors";
import { discoveryRouter } from "./discovery.js";
import { checkoutRouter } from "./checkout.js";

const app = new Hono();

// CORS for browser/agent access
app.use("*", cors());

// UCP Discovery endpoint
app.route("/.well-known/ucp", discoveryRouter);

// Shopping API
app.route("/api/shopping", checkoutRouter);

// Health check
app.get("/health", (c) => c.json({ status: "ok", protocol: "UCP", version: "2026-01-11" }));

// Export as Firebase Function using any type to bypass strict typing
export const api = onRequest(async (req, res) => {
    // Convert Node.js Request to Web Request
    const url = new URL(req.url || "/", `https://${req.headers.host}`);
    const headers = new Headers();
    for (const [key, value] of Object.entries(req.headers)) {
        if (value) headers.set(key, Array.isArray(value) ? value[0] : value);
    }

    let body: BodyInit | null = null;
    if (req.method !== "GET" && req.method !== "HEAD") {
        body = JSON.stringify(req.body);
    }

    const webRequest = new Request(url.toString(), {
        method: req.method,
        headers,
        body,
    });

    const webResponse = await app.fetch(webRequest);

    // Set response headers
    webResponse.headers.forEach((value, key) => {
        res.setHeader(key, value);
    });

    res.status(webResponse.status);
    const responseBody = await webResponse.text();
    res.send(responseBody);
});

/** @type {import('next').NextConfig} */
const { initOpenNextCloudflareForDev } = require("@opennextjs/cloudflare");

// Makes the Next.js dev server integrate with the OpenNext Cloudflare
// adapter (needed for Cloudflare bindings during local development).
// See https://opennext.js.org/cloudflare/get-started
initOpenNextCloudflareForDev();

const nextConfig = {
  reactStrictMode: true,
};

module.exports = nextConfig;

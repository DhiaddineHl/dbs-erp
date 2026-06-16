import type { NextConfig } from "next";

const nextConfig: NextConfig = {
  // xlsx (SheetJS) is a CommonJS lib used only in server actions — keep it out
  // of the bundler so it loads at runtime on the server.
  serverExternalPackages: ["xlsx"],
};

export default nextConfig;

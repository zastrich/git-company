import type { NextConfig } from "next";

const nextConfig: NextConfig = {
  // Gera um servidor Node autossuficiente em .next/standalone,
  // permitindo distribuir o app buildado no pacote npm (npx) e
  // executar com `node .next/standalone/server.js`.
  output: "standalone",
};

export default nextConfig;

import type { NextConfig } from "next";

const nextConfig: NextConfig = {
  // Gera um servidor Node autossuficiente em .next/standalone,
  // permitindo distribuir o app buildado no pacote npm (npx) e
  // executar com `node .next/standalone/server.js`.
  output: "standalone",

  // Trata o Prisma como pacote externo do servidor: evita que o bundler
  // (Turbopack/Webpack) reescreva o require com hash, que quebra a resolução
  // do @prisma/client dentro do bundle standalone.
  serverExternalPackages: ["@prisma/client", "prisma"],
};

export default nextConfig;

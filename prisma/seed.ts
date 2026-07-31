// prisma/seed.ts
// Seeds the database with default AI providers.
// Run: bun run prisma/seed.ts

import { PrismaClient } from "@prisma/client";

const prisma = new PrismaClient();

const defaultProviders = [
  {
    name: "OpenAI (ChatGPT)",
    slug: "openai",
    type: "openai",
    baseUrl: null,
    isLocal: false,
  },
  {
    name: "Anthropic (Claude)",
    slug: "anthropic",
    type: "anthropic",
    baseUrl: null,
    isLocal: false,
  },
  {
    name: "Google (Gemini)",
    slug: "gemini",
    type: "gemini",
    baseUrl: null,
    isLocal: false,
  },
  {
    name: "AWS Bedrock",
    slug: "bedrock",
    type: "bedrock",
    baseUrl: null,
    isLocal: false,
  },
  {
    name: "Moonshot (Kimi K3)",
    slug: "moonshot",
    type: "moonshot",
    baseUrl: "https://api.moonshot.cn/v1",
    isLocal: false,
  },
  {
    name: "Ollama (Local)",
    slug: "ollama",
    type: "ollama",
    baseUrl: "http://localhost:11434",
    isLocal: true,
  },
  {
    name: "Groq",
    slug: "groq",
    type: "groq",
    baseUrl: null,
    isLocal: false,
  },
];

async function main() {
  console.log("Seeding AI providers...");

  for (const provider of defaultProviders) {
    await prisma.aIProvider.upsert({
      where: { slug: provider.slug },
      update: {
        name: provider.name,
        type: provider.type,
        baseUrl: provider.baseUrl,
        isLocal: provider.isLocal,
      },
      create: provider,
    });
    console.log(`  ✓ ${provider.name}`);
  }

  console.log("\nDone! All providers seeded.");
}

main()
  .catch((e) => {
    console.error(e);
    process.exit(1);
  })
  .finally(() => prisma.$disconnect());

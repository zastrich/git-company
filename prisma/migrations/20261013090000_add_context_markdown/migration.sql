-- AlterTable: add contextMarkdown (long Markdown context) column to AgentConfig
ALTER TABLE "AgentConfig" ADD COLUMN "contextMarkdown" TEXT NOT NULL DEFAULT '';

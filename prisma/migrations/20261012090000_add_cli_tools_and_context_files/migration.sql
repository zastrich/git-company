-- AlterTable: add cliTools and contextFiles JSON-string columns to AgentConfig
ALTER TABLE "AgentConfig" ADD COLUMN "cliTools" TEXT NOT NULL DEFAULT '';
ALTER TABLE "AgentConfig" ADD COLUMN "contextFiles" TEXT NOT NULL DEFAULT '';

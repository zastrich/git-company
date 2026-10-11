-- AlterTable: add mcpServers JSON-string column to AgentConfig
ALTER TABLE "AgentConfig" ADD COLUMN "mcpServers" TEXT NOT NULL DEFAULT '';

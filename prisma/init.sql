-- CreateTable
CREATE TABLE "Company" (
    "id" TEXT NOT NULL PRIMARY KEY,
    "name" TEXT NOT NULL,
    "slug" TEXT NOT NULL,
    "repoPrefix" TEXT NOT NULL DEFAULT '',
    "githubOwner" TEXT NOT NULL DEFAULT '',
    "githubToken" TEXT NOT NULL,
    "webhookSecret" TEXT NOT NULL,
    "repoName" TEXT NOT NULL,
    "projectId" TEXT,
    "mission" TEXT NOT NULL DEFAULT '',
    "createdAt" DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" DATETIME NOT NULL
);

-- CreateTable
CREATE TABLE "AIProvider" (
    "id" TEXT NOT NULL PRIMARY KEY,
    "name" TEXT NOT NULL,
    "slug" TEXT NOT NULL,
    "type" TEXT NOT NULL,
    "baseUrl" TEXT,
    "isLocal" BOOLEAN NOT NULL DEFAULT false,
    "createdAt" DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP
);

-- CreateTable
CREATE TABLE "AgentConfig" (
    "id" TEXT NOT NULL PRIMARY KEY,
    "companyId" TEXT NOT NULL,
    "agentId" TEXT NOT NULL,
    "role" TEXT NOT NULL,
    "type" TEXT NOT NULL DEFAULT 'ai',
    "context" TEXT NOT NULL,
    "providerId" TEXT,
    "model" TEXT NOT NULL DEFAULT '',
    "temperature" REAL NOT NULL DEFAULT 0.2,
    "maxTokens" INTEGER NOT NULL DEFAULT 4096,
    "tickIntervalSeconds" INTEGER NOT NULL DEFAULT 300,
    "labels" TEXT NOT NULL DEFAULT '',
    "subordinates" TEXT NOT NULL DEFAULT '',
    "isPaused" BOOLEAN NOT NULL DEFAULT false,
    "isCeo" BOOLEAN NOT NULL DEFAULT false,
    "githubUsername" TEXT NOT NULL DEFAULT '',
    "createdAt" DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" DATETIME NOT NULL,
    CONSTRAINT "AgentConfig_companyId_fkey" FOREIGN KEY ("companyId") REFERENCES "Company" ("id") ON DELETE CASCADE ON UPDATE CASCADE,
    CONSTRAINT "AgentConfig_providerId_fkey" FOREIGN KEY ("providerId") REFERENCES "AIProvider" ("id") ON DELETE SET NULL ON UPDATE CASCADE
);

-- CreateTable
CREATE TABLE "ChatMessage" (
    "id" TEXT NOT NULL PRIMARY KEY,
    "companyId" TEXT NOT NULL,
    "agentId" TEXT NOT NULL,
    "agentConfigId" TEXT NOT NULL,
    "role" TEXT NOT NULL,
    "content" TEXT NOT NULL,
    "createdAt" DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
    CONSTRAINT "ChatMessage_companyId_fkey" FOREIGN KEY ("companyId") REFERENCES "Company" ("id") ON DELETE CASCADE ON UPDATE CASCADE,
    CONSTRAINT "ChatMessage_agentConfigId_fkey" FOREIGN KEY ("agentConfigId") REFERENCES "AgentConfig" ("id") ON DELETE CASCADE ON UPDATE CASCADE
);

-- CreateTable
CREATE TABLE "CompanyConfig" (
    "id" TEXT NOT NULL PRIMARY KEY,
    "companyId" TEXT NOT NULL,
    "key" TEXT NOT NULL,
    "value" TEXT NOT NULL,
    CONSTRAINT "CompanyConfig_companyId_fkey" FOREIGN KEY ("companyId") REFERENCES "Company" ("id") ON DELETE CASCADE ON UPDATE CASCADE
);

-- CreateTable
CREATE TABLE "CompanyRepo" (
    "id" TEXT NOT NULL PRIMARY KEY,
    "companyId" TEXT NOT NULL,
    "shortId" TEXT NOT NULL,
    "fullName" TEXT NOT NULL,
    "description" TEXT NOT NULL DEFAULT '',
    "createdAt" DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
    CONSTRAINT "CompanyRepo_companyId_fkey" FOREIGN KEY ("companyId") REFERENCES "Company" ("id") ON DELETE CASCADE ON UPDATE CASCADE
);

-- CreateTable
CREATE TABLE "CompanySecret" (
    "id" TEXT NOT NULL PRIMARY KEY,
    "companyId" TEXT NOT NULL,
    "key" TEXT NOT NULL,
    "value" TEXT NOT NULL,
    CONSTRAINT "CompanySecret_companyId_fkey" FOREIGN KEY ("companyId") REFERENCES "Company" ("id") ON DELETE CASCADE ON UPDATE CASCADE
);

-- CreateTable
CREATE TABLE "SchedulerProcess" (
    "id" TEXT NOT NULL PRIMARY KEY,
    "companyId" TEXT NOT NULL,
    "pid" INTEGER,
    "status" TEXT NOT NULL DEFAULT 'STOPPED',
    "startedAt" DATETIME,
    "stoppedAt" DATETIME,
    "updatedAt" DATETIME NOT NULL,
    CONSTRAINT "SchedulerProcess_companyId_fkey" FOREIGN KEY ("companyId") REFERENCES "Company" ("id") ON DELETE CASCADE ON UPDATE CASCADE
);

-- CreateTable
CREATE TABLE "AuditLog" (
    "id" TEXT NOT NULL PRIMARY KEY,
    "companyId" TEXT NOT NULL,
    "agentId" TEXT NOT NULL DEFAULT '',
    "agentName" TEXT NOT NULL,
    "action" TEXT NOT NULL,
    "details" TEXT NOT NULL,
    "createdAt" DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
    CONSTRAINT "AuditLog_companyId_fkey" FOREIGN KEY ("companyId") REFERENCES "Company" ("id") ON DELETE CASCADE ON UPDATE CASCADE
);

-- CreateIndex
CREATE UNIQUE INDEX "Company_slug_key" ON "Company"("slug");

-- CreateIndex
CREATE UNIQUE INDEX "AIProvider_slug_key" ON "AIProvider"("slug");

-- CreateIndex
CREATE UNIQUE INDEX "AgentConfig_companyId_agentId_key" ON "AgentConfig"("companyId", "agentId");

-- CreateIndex
CREATE UNIQUE INDEX "CompanyConfig_companyId_key_key" ON "CompanyConfig"("companyId", "key");

-- CreateIndex
CREATE UNIQUE INDEX "CompanyRepo_companyId_shortId_key" ON "CompanyRepo"("companyId", "shortId");

-- CreateIndex
CREATE UNIQUE INDEX "CompanySecret_companyId_key_key" ON "CompanySecret"("companyId", "key");


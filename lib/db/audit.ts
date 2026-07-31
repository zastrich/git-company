import { prisma } from "./client";

export interface AuditLogData {
  companyId: string;
  agentId?: string;
  agentName: string;
  action: string;
  details: any;
}

export async function createAuditLog(data: AuditLogData) {
  return await prisma.auditLog.create({
    data: {
      companyId: data.companyId,
      agentId: data.agentId ?? "",
      agentName: data.agentName,
      action: data.action,
      details: typeof data.details === "string" ? data.details : JSON.stringify(data.details),
    },
  });
}

export async function getAuditLogs(companyId: string, limit = 50) {
  return await prisma.auditLog.findMany({
    where: { companyId },
    orderBy: { createdAt: "desc" },
    take: limit,
  });
}

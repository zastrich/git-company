import { NextResponse } from 'next/server';
import crypto from 'crypto';
import { prisma } from '../../../../lib/db/client';
import { createAuditLog } from '../../../../lib/db/audit';
import { pullFromRemote } from '../../../../lib/sync/org-sync';
import { BaaCDiffEngine } from '../../../../lib/baac/diff';

// Helper to verify GitHub webhook signature
function verifySignature(payloadText: string, signature: string, secret: string) {
  const hmac = crypto.createHmac('sha256', secret);
  const digest = 'sha256=' + hmac.update(payloadText).digest('hex');
  return crypto.timingSafeEqual(Buffer.from(digest), Buffer.from(signature));
}

export async function POST(
  request: Request,
  { params }: { params: Promise<{ companySlug: string }> }
) {
  const { companySlug } = await params;

  // 1. Localiza o tenant no banco
  const company = await prisma.company.findUnique({
    where: { slug: companySlug },
  });

  if (!company) {
    return NextResponse.json({ error: 'Tenant Not Found' }, { status: 404 });
  }

  const payloadText = await request.text();
  const signature = request.headers.get('x-hub-signature-256') || '';

  // 2. Validação criptográfica do payload (HMAC-SHA256)
  if (!signature) {
    return NextResponse.json({ error: 'Missing Signature' }, { status: 401 });
  }

  try {
    if (!verifySignature(payloadText, signature, company.webhookSecret)) {
      await createAuditLog({
        companyId: company.id,
        agentName: 'System',
        action: 'WEBHOOK_FAILED_VALIDATION',
        details: 'Unauthorized Tenant Signature',
      });
      return NextResponse.json({ error: 'Unauthorized Tenant Signature' }, { status: 401 });
    }
  } catch {
    return NextResponse.json({ error: 'Invalid Signature format' }, { status: 400 });
  }

  const eventType = request.headers.get('x-github-event') || 'unknown';
  let payload: any;
  try {
    payload = JSON.parse(payloadText);
  } catch {
    return NextResponse.json({ error: 'Invalid JSON payload' }, { status: 400 });
  }

  // 3. Processamento de Webhook
  // Quando uma issue é criada ou modificada, ou quando o business.json é atualizado (push).
  
  if (eventType === 'push') {
    // Verificar se o arquivo business.json foi modificado
    const commits = payload.commits || [];
    let businessJsonModified = false;
    for (const commit of commits) {
      if (
        (commit.added && commit.added.includes('business.json')) ||
        (commit.modified && commit.modified.includes('business.json'))
      ) {
        businessJsonModified = true;
        break;
      }
    }

    if (businessJsonModified) {
      console.log(`[Webhook] business.json modificado no repositório do tenant ${company.slug}`);
      
      // Auto-pull: sincronizar configurações remotas para o banco local
      try {
        const syncResult = await pullFromRemote(company.id);
        console.log(`[Webhook] Sync pull: ${syncResult.message}`);
      } catch (err: any) {
        console.error(`[Webhook] Sync pull failed:`, err.message);
      }

      // Disparar BaaC Diff Engine para sincronizar infraestrutura
      try {
        const { fetchRemoteBusinessJson } = await import('../../../../lib/sync/org-sync');
        const { content } = await fetchRemoteBusinessJson(company.githubToken, company.githubOwner, company.repoName);
        const diffEngine = new BaaCDiffEngine(company.githubToken, company.githubOwner, company.repoName);
        await diffEngine.syncInfrastructure(content, company.projectId ?? undefined);
      } catch (err: any) {
        console.error(`[Webhook] BaaC sync failed:`, err.message);
      }

      await createAuditLog({
        companyId: company.id,
        agentName: 'System',
        action: 'BAAC_SYNC_TRIGGERED',
        details: { trigger: 'push', file: 'business.json' },
      });
    }
  }

  if (eventType === 'issues' || eventType === 'issue_comment') {
    console.log(`[Webhook] Issue event (${payload.action}) para tenant ${company.slug}`);
    
    // Opcionalmente, podemos apenas registrar o evento e deixar o Scheduler processar a fila,
    // ou podemos disparar o Scheduler --run-now (para testes rápidos)
    await createAuditLog({
      companyId: company.id,
      agentName: 'System',
      action: `GITHUB_EVENT_${eventType.toUpperCase()}`,
      details: {
        action: payload.action,
        issueNumber: payload.issue?.number,
        title: payload.issue?.title,
      },
    });
  }

  return NextResponse.json({ success: true, tenant: company.name });
}

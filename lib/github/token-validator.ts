// lib/github/token-validator.ts
// Single Responsibility: Validate GitHub token scopes before operations.
// Ensures the token has all required permissions upfront.

import { Octokit } from "@octokit/rest";

/** Scopes obrigatórios para o GitCompany-AI funcionar completamente */
export const REQUIRED_SCOPES = ["repo", "project", "read:org"] as const;

/** Scopes recomendados mas não obrigatórios */
export const RECOMMENDED_SCOPES = ["workflow"] as const;

export interface TokenValidationResult {
  valid: boolean;
  login: string;
  currentScopes: string[];
  missingRequired: string[];
  missingRecommended: string[];
  message: string;
}

/**
 * Valida se um token GitHub tem todos os scopes necessários.
 * Faz uma chamada leve à API para obter o header X-OAuth-Scopes.
 */
export async function validateToken(token: string): Promise<TokenValidationResult> {
  const octokit = new Octokit({ auth: token });

  try {
    const response = await octokit.rest.users.getAuthenticated();
    const login = response.data.login;

    // GitHub retorna os scopes no header da resposta
    const scopeHeader = response.headers["x-oauth-scopes"] ?? "";
    const currentScopes = scopeHeader
      .split(",")
      .map((s: string) => s.trim())
      .filter(Boolean);

    const missingRequired = REQUIRED_SCOPES.filter(
      (scope) => !currentScopes.some((s: string) => s === scope || s.startsWith(`${scope}:`))
    );

    const missingRecommended = RECOMMENDED_SCOPES.filter(
      (scope) => !currentScopes.some((s: string) => s === scope || s.startsWith(`${scope}:`))
    );

    if (missingRequired.length > 0) {
      return {
        valid: false,
        login,
        currentScopes,
        missingRequired,
        missingRecommended,
        message: `Token do usuário "${login}" não tem os scopes obrigatórios: ${missingRequired.join(", ")}.\n` +
          `Scopes atuais: ${currentScopes.join(", ") || "(nenhum)"}\n\n` +
          `Para criar um token com os scopes corretos:\n` +
          `  1. Acesse https://github.com/settings/tokens/new\n` +
          `  2. Selecione: repo, project, read:org, workflow\n` +
          `  3. Ou atualize via CLI: gh auth refresh -s repo,project,read:org,workflow`,
      };
    }

    let message = `✅ Token válido para "${login}" com scopes: ${currentScopes.join(", ")}`;
    if (missingRecommended.length > 0) {
      message += `\n⚠️  Scopes recomendados ausentes: ${missingRecommended.join(", ")}`;
    }

    return {
      valid: true,
      login,
      currentScopes,
      missingRequired: [],
      missingRecommended,
      message,
    };
  } catch (err: any) {
    return {
      valid: false,
      login: "",
      currentScopes: [],
      missingRequired: [...REQUIRED_SCOPES],
      missingRecommended: [...RECOMMENDED_SCOPES],
      message: `❌ Token inválido ou expirado: ${err.message}`,
    };
  }
}

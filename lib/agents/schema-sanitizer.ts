// lib/agents/schema-sanitizer.ts
//
// Sanitizador de JSON Schema para o subconjunto aceito pela API de
// function-calling do Google Gemini (@langchain/google-genai).
//
// MOTIVAÇÃO: servidores MCP (Notion, Playwright, etc.) expõem ferramentas cujos
// inputSchema usam palavras-chave de JSON Schema que o Gemini REJEITA com
// `[400 Bad Request] ... Unknown name "$defs"/"$ref"/"propertyNames"`. Este
// módulo converte um JSON Schema arbitrário no subconjunto seguro, preservando
// a semântica (type/properties/required/items/enum/description) sempre que
// possível. O subconjunto emitido também é JSON Schema válido aceito por
// OpenAI/Anthropic/outros — por isso é aplicado para TODOS os provedores
// (sem ramificar por provider), mantendo os testes existentes verdes.
//
// Função PURA: sem I/O, sem segredos, sem efeitos colaterais além de
// console.warn em degradação.

/** Profundidade máxima de recursão antes de degradar para fallback genérico. */
const MAX_DEPTH = 12;

/** Palavras-chave do subconjunto seguro preservadas no nó final. */
type SafeSchema = Record<string, unknown>;

/** Fallback genérico de objeto (raiz sempre deve ser um objeto). */
function minimalObject(): SafeSchema {
  return { type: "object", properties: {} };
}

/** Resolve um ponteiro local do tipo `#/$defs/Name` ou `#/definitions/Name`. */
function resolveRef(ref: string, root: Record<string, unknown>): unknown {
  if (typeof ref !== "string" || !ref.startsWith("#/")) return undefined;
  const parts = ref.slice(2).split("/");
  let cur: unknown = root;
  for (const rawPart of parts) {
    // JSON Pointer: ~1 => "/", ~0 => "~"
    const part = rawPart.replace(/~1/g, "/").replace(/~0/g, "~");
    if (cur && typeof cur === "object" && part in (cur as Record<string, unknown>)) {
      cur = (cur as Record<string, unknown>)[part];
    } else {
      return undefined;
    }
  }
  return cur;
}

/** Lista de combinadores que são achatados para o primeiro subschema viável. */
const COMBINATORS = ["anyOf", "any_of", "oneOf", "allOf"] as const;

/**
 * Walk recursivo com desreferenciamento de $ref/$defs e remoção de palavras
 * não suportadas. `depth` limita a recursão; `seenRefs` detecta ciclos pelo
 * ponteiro de $ref sendo seguido na cadeia atual.
 */
function walk(
  node: unknown,
  root: Record<string, unknown>,
  depth: number,
  seenRefs: Set<string>,
  isLeafContext: boolean
): SafeSchema {
  // Cap de profundidade: degrada para fallback conforme o contexto.
  if (depth > MAX_DEPTH) {
    return isLeafContext ? { type: "string" } : minimalObject();
  }

  if (!node || typeof node !== "object" || Array.isArray(node)) {
    // Nó não-objeto (ou ausente) — degrada de forma segura.
    return isLeafContext ? { type: "string" } : minimalObject();
  }

  const obj = node as Record<string, unknown>;

  // ── (1) Desreferenciar $ref ──
  if (typeof obj.$ref === "string") {
    const ref = obj.$ref;
    if (seenRefs.has(ref)) {
      // Ciclo detectado — degrada para genérico, sem recursão infinita.
      return isLeafContext ? { type: "string" } : minimalObject();
    }
    const resolved = resolveRef(ref, root);
    if (resolved === undefined) {
      // $ref não resolvível — fallback genérico (não lança).
      return isLeafContext ? { type: "string" } : minimalObject();
    }
    const nextSeen = new Set(seenRefs);
    nextSeen.add(ref);
    return walk(resolved, root, depth + 1, nextSeen, isLeafContext);
  }

  // ── Achatar combinadores (anyOf/oneOf/allOf/any_of) ──
  for (const key of COMBINATORS) {
    const branch = obj[key];
    if (Array.isArray(branch) && branch.length > 0) {
      for (const sub of branch) {
        const candidate = walk(sub, root, depth + 1, seenRefs, isLeafContext);
        // Primeiro subschema viável (que não degradou a fallback vazio puro).
        if (candidate && typeof candidate === "object") {
          return candidate;
        }
      }
      return isLeafContext ? { type: "string" } : minimalObject();
    }
  }

  const out: SafeSchema = {};

  // ── Preservar `type` (ou inferir) ──
  if (typeof obj.type === "string") {
    out.type = obj.type;
  } else if (Array.isArray(obj.type)) {
    // JSON Schema permite type como array — pega o primeiro string.
    const first = (obj.type as unknown[]).find((t) => typeof t === "string");
    if (typeof first === "string") out.type = first;
  }

  // ── description ──
  if (typeof obj.description === "string") {
    out.description = obj.description;
  }

  // ── const → enum de um valor ──
  if ("const" in obj) {
    out.enum = [obj.const];
    if (!out.type && obj.const !== null && obj.const !== undefined) {
      const ct = typeof obj.const;
      if (ct === "string" || ct === "number" || ct === "boolean") out.type = ct;
    }
  }

  // ── enum ──
  if (Array.isArray(obj.enum)) {
    out.enum = obj.enum;
  }

  // ── properties (recursão) ──
  if (obj.properties && typeof obj.properties === "object" && !Array.isArray(obj.properties)) {
    const props: Record<string, unknown> = {};
    for (const [k, v] of Object.entries(obj.properties as Record<string, unknown>)) {
      props[k] = walk(v, root, depth + 1, seenRefs, true);
    }
    out.properties = props;
    out.type = "object";
  }

  // ── items (recursão) ──
  if (obj.items !== undefined) {
    if (Array.isArray(obj.items)) {
      // Tuple schema — usa o primeiro item como esquema do array.
      out.items = walk(obj.items[0], root, depth + 1, seenRefs, true);
    } else {
      out.items = walk(obj.items, root, depth + 1, seenRefs, true);
    }
    out.type = "array";
  }

  // ── required (só mantém chaves presentes em properties) ──
  if (Array.isArray(obj.required)) {
    const props = (out.properties as Record<string, unknown> | undefined) ?? {};
    const filtered = (obj.required as unknown[]).filter(
      (r): r is string => typeof r === "string" && r in props
    );
    if (filtered.length > 0) out.required = filtered;
  }

  // ── Normalização de nó-objeto ──
  // Se é (ou foi inferido como) objeto, garante properties:{}.
  if (out.type === "object" && !out.properties) {
    out.properties = {};
  }
  // Nó sem type nem forma reconhecível → degrada conforme contexto.
  if (!out.type && !out.enum && !out.properties && !out.items) {
    return isLeafContext ? { type: "string" } : minimalObject();
  }

  return out;
}

/**
 * Converte um JSON Schema arbitrário no subconjunto seguro aceito pelo Gemini.
 * - Desreferencia $ref/$defs/definitions (inline), tratando refs aninhadas,
 *   limitando a profundidade e degradando nós cíclicos para objeto/string.
 * - Remove/converte palavras não suportadas ($schema, $defs, $ref,
 *   propertyNames, additionalProperties, patternProperties, const, default não
 *   suportado) achatando anyOf/any_of/oneOf/allOf.
 * - Preserva type/properties/required/items/enum/description.
 * - A raiz é SEMPRE um esquema de objeto; entradas inválidas degradam para
 *   `{ type:"object", properties:{} }` com um warning nomeando a ferramenta.
 */
export function sanitizeToolSchema(
  schema: unknown,
  toolName?: string
): Record<string, unknown> {
  try {
    if (!schema || typeof schema !== "object" || Array.isArray(schema)) {
      return minimalObject();
    }
    const root = schema as Record<string, unknown>;
    const result = walk(root, root, 0, new Set<string>(), false);

    // A raiz precisa ser um objeto com properties.
    if (result.type !== "object") {
      // Envolve o resultado como objeto, preservando o possível como propriedade?
      // Mais seguro para ferramentas: raiz vazia de objeto.
      if (!result.properties) {
        return { type: "object", properties: {} };
      }
    }
    if (!result.properties) {
      result.properties = {};
    }
    result.type = "object";
    return result;
  } catch (err) {
    console.warn(
      `[schema-sanitizer] fell back to minimal schema for tool "${toolName ?? "unknown"}": ${
        err instanceof Error ? err.message : String(err)
      }`
    );
    return minimalObject();
  }
}

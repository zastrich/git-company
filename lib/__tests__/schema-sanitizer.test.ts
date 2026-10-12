// lib/__tests__/schema-sanitizer.test.ts
import { describe, it, expect } from "vitest";
import { sanitizeToolSchema } from "../agents/schema-sanitizer";

const FORBIDDEN = [
  "$schema",
  "$defs",
  "definitions",
  "$ref",
  "propertyNames",
  "patternProperties",
  "additionalProperties",
  "anyOf",
  "oneOf",
  "allOf",
  "const",
];

function assertNoForbidden(result: unknown) {
  const json = JSON.stringify(result);
  for (const key of FORBIDDEN) {
    expect(json).not.toContain(key);
  }
}

describe("schema-sanitizer - sanitizeToolSchema", () => {
  it("(a) dereferences $ref/$defs leaving none behind", () => {
    const schema = {
      type: "object",
      $defs: {
        Address: {
          type: "object",
          properties: { city: { type: "string" } },
          required: ["city"],
        },
      },
      properties: {
        home: { $ref: "#/$defs/Address" },
      },
      required: ["home"],
    };

    const result = sanitizeToolSchema(schema, "ref-tool");
    const json = JSON.stringify(result);
    expect(json).not.toContain("$ref");
    expect(json).not.toContain("$defs");
    // A propriedade inlined mantém o shape referenciado.
    const home = (result.properties as any).home;
    expect(home.type).toBe("object");
    expect(home.properties.city.type).toBe("string");
    expect(home.required).toEqual(["city"]);
  });

  it("(b) removes propertyNames/additionalProperties/patternProperties, keeps siblings", () => {
    const schema = {
      type: "object",
      additionalProperties: false,
      patternProperties: { "^x-": { type: "string" } },
      propertyNames: { pattern: "^[a-z]+$" },
      properties: {
        name: { type: "string" },
      },
      required: ["name"],
    };

    const result = sanitizeToolSchema(schema, "strip-tool");
    const json = JSON.stringify(result);
    expect(json).not.toContain("additionalProperties");
    expect(json).not.toContain("patternProperties");
    expect(json).not.toContain("propertyNames");
    // Irmãos preservados.
    expect(result.type).toBe("object");
    expect((result.properties as any).name.type).toBe("string");
    expect(result.required).toEqual(["name"]);
  });

  it("(c) a cyclic schema does not hang and degrades safely", () => {
    const schema = {
      type: "object",
      $defs: {
        Node: {
          type: "object",
          properties: {
            value: { type: "string" },
            children: {
              type: "array",
              items: { $ref: "#/$defs/Node" },
            },
          },
        },
      },
      properties: {
        root: { $ref: "#/$defs/Node" },
      },
    };

    const start = Date.now();
    const result = sanitizeToolSchema(schema, "cyclic-tool");
    const elapsed = Date.now() - start;

    // Não trava: completa muito abaixo do timeout padrão do vitest.
    expect(elapsed).toBeLessThan(2000);
    const json = JSON.stringify(result);
    expect(json).not.toContain("$ref");
    expect(json).not.toContain("$defs");
    // O nó cíclico degradou para genérico (object/string), sem recursão infinita.
    expect(result.type).toBe("object");
  });

  it("(d1) a Notion-like schema ($defs + $ref + anyOf) has no forbidden keys", () => {
    const notionLike = {
      $schema: "http://json-schema.org/draft-07/schema#",
      type: "object",
      $defs: {
        RichText: {
          type: "object",
          properties: { content: { type: "string" } },
        },
      },
      properties: {
        parent: {
          anyOf: [
            { type: "object", properties: { page_id: { type: "string" } } },
            { type: "object", properties: { database_id: { type: "string" } } },
          ],
        },
        title: { $ref: "#/$defs/RichText" },
        icon: { const: "emoji" },
      },
      required: ["parent"],
    };

    const result = sanitizeToolSchema(notionLike, "notion-create-page");
    assertNoForbidden(result);
    expect(result.type).toBe("object");
    // anyOf achatado para o primeiro subschema viável.
    expect((result.properties as any).parent.type).toBe("object");
    expect((result.properties as any).title.properties.content.type).toBe("string");
  });

  it("(d2) a Playwright-like schema (propertyNames) has no forbidden keys", () => {
    const playwrightLike = {
      type: "object",
      properties: {
        selector: { type: "string", description: "CSS selector" },
        options: {
          type: "object",
          propertyNames: { pattern: "^data-" },
          additionalProperties: { type: "string" },
        },
      },
      required: ["selector"],
    };

    const result = sanitizeToolSchema(playwrightLike, "browser_click");
    assertNoForbidden(result);
    expect((result.properties as any).selector.type).toBe("string");
    expect((result.properties as any).options.type).toBe("object");
  });

  it("(e) a simple CLI-style schema passes through unchanged in meaning", () => {
    const cli = {
      type: "object",
      properties: {
        title: { type: "string" },
      },
      required: ["title"],
    };

    const result = sanitizeToolSchema(cli, "gh-issue");
    expect(result.type).toBe("object");
    expect(Object.keys(result.properties as object)).toEqual(["title"]);
    expect((result.properties as any).title.type).toBe("string");
    expect(result.required).toEqual(["title"]);
  });

  it("falls back to minimal object schema for a non-object input", () => {
    const result = sanitizeToolSchema("not a schema", "weird-tool");
    expect(result).toEqual({ type: "object", properties: {} });
  });
});

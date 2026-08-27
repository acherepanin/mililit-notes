import { BadRequestException, Injectable } from "@nestjs/common";

import { AI_TOOL_SPECS, type AiToolName } from "./ai-tool-registry.js";

export type AiToolRiskClass =
  "read_only" | "reversible_write" | "destructive" | "external" | "costly";

const SECURITY_POLICIES = new Set(["notes-ai-v1"]);

@Injectable()
export class AiPolicyService {
  assertSecurityPolicy(key: string): void {
    if (!SECURITY_POLICIES.has(key)) {
      throw new BadRequestException(`Unknown AI security policy: ${key}`);
    }
  }

  assertTools(toolNames: readonly string[]): void {
    for (const name of toolNames) {
      if (!(name in AI_TOOL_SPECS)) {
        throw new BadRequestException(`Unknown AI tool: ${name}`);
      }
    }
  }

  riskFor(toolName: string): AiToolRiskClass {
    const spec = AI_TOOL_SPECS[toolName as AiToolName];
    if (!spec) throw new BadRequestException(`Unknown AI tool: ${toolName}`);
    return spec.risk;
  }

  requiresConfirmation(toolName: string): boolean {
    return ["destructive", "external", "costly"].includes(
      this.riskFor(toolName),
    );
  }
}

import {
  ForbiddenException,
  Inject,
  Injectable,
  NotFoundException,
  ServiceUnavailableException,
} from "@nestjs/common";
import { activityLogs } from "@notes/db";

import { DatabaseService } from "../database/database.service.js";
import {
  adminAlertNames,
  type AdminAlertName,
  type AdminSilenceCreateInput,
} from "./admin-alerting.validation.js";

const alertNames = new Set<string>(adminAlertNames);
const managedByPrefix = "notes-admin:";
const maximumResponseBytes = 1_000_000;
const requestTimeoutMs = 3_000;
const uuid =
  /^[0-9a-f]{8}-[0-9a-f]{4}-[1-5][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i;

type JsonObject = Record<string, unknown>;

function object(value: unknown): JsonObject | null {
  return value && typeof value === "object" && !Array.isArray(value)
    ? (value as JsonObject)
    : null;
}

function text(value: unknown, maximum = 120): string | null {
  if (typeof value !== "string") return null;
  const sanitized = [...value]
    .map((character) => {
      const code = character.charCodeAt(0);
      return code <= 31 || code === 127 ? " " : character;
    })
    .join("")
    .replace(/\s+/g, " ")
    .trim();
  return sanitized ? sanitized.slice(0, maximum) : null;
}

function timestamp(value: unknown): string | null {
  if (typeof value !== "string" || !Number.isFinite(Date.parse(value))) {
    return null;
  }
  return new Date(value).toISOString();
}

function label(labels: JsonObject | null, name: string): string | null {
  return text(labels?.[name], 80);
}

function silenceAlertName(value: JsonObject): AdminAlertName | null {
  const matchers = Array.isArray(value.matchers) ? value.matchers : [];
  const matcher = matchers
    .map(object)
    .find(
      (item) =>
        item?.name === "alertname" &&
        item.isRegex !== true &&
        item.isEqual !== false &&
        typeof item.value === "string" &&
        alertNames.has(item.value),
    );
  return (matcher?.value as AdminAlertName | undefined) ?? null;
}

function managedSilence(value: JsonObject): boolean {
  return (
    typeof value.createdBy === "string" &&
    value.createdBy.startsWith(managedByPrefix) &&
    silenceAlertName(value) !== null
  );
}

@Injectable()
export class AdminAlertingService {
  constructor(
    @Inject(DatabaseService) private readonly database: DatabaseService,
  ) {}

  async getState() {
    const configuration = this.configuration();
    if (!configuration) {
      return {
        alerts: [],
        configured: false,
        delivery: { failed: 0, sent: 0 },
        generatedAt: new Date().toISOString(),
        silences: [],
      };
    }

    const [alerts, silences, total, failed] = await Promise.all([
      this.alerts(configuration.alertmanager),
      this.silences(configuration.alertmanager),
      this.prometheusCounter(
        configuration.prometheus,
        "sum(alertmanager_notifications_total)",
      ),
      this.prometheusCounter(
        configuration.prometheus,
        "sum(alertmanager_notifications_failed_total)",
      ),
    ]);

    return {
      alerts,
      configured: true,
      delivery: { failed, sent: Math.max(0, total - failed) },
      generatedAt: new Date().toISOString(),
      silences,
    };
  }

  async createSilence(actorId: number, input: AdminSilenceCreateInput) {
    const configuration = this.requireConfiguration();
    const startsAt = new Date();
    const endsAt = new Date(
      startsAt.getTime() + input.durationMinutes * 60 * 1_000,
    );
    const response = object(
      await this.json(`${configuration.alertmanager}/api/v2/silences`, {
        body: JSON.stringify({
          comment: input.comment,
          createdBy: `${managedByPrefix}${actorId}`,
          endsAt: endsAt.toISOString(),
          matchers: [
            {
              isEqual: true,
              isRegex: false,
              name: "alertname",
              value: input.alertName,
            },
          ],
          startsAt: startsAt.toISOString(),
        }),
        headers: { "content-type": "application/json" },
        method: "POST",
      }),
    );
    const silenceId = text(response?.silenceID, 36);
    if (!silenceId || !uuid.test(silenceId)) {
      throw new ServiceUnavailableException(
        "Alerting backend returned an invalid silence identifier",
      );
    }
    try {
      await this.database.client.insert(activityLogs).values({
        action: "admin.alert_silence.create",
        actorId,
        details: {
          alertName: input.alertName,
          durationMinutes: input.durationMinutes,
          silenceId,
        },
        targetType: "alertmanager_silence",
      });
    } catch (error) {
      await this.removeSilence(configuration.alertmanager, silenceId).catch(
        () => undefined,
      );
      throw error;
    }
    return this.getState();
  }

  async deleteSilence(actorId: number, silenceId: string) {
    const configuration = this.requireConfiguration();
    const current = object(
      await this.json(
        `${configuration.alertmanager}/api/v2/silence/${silenceId}`,
        undefined,
        true,
      ),
    );
    if (!current) throw new NotFoundException("Silence was not found");
    const alertName = silenceAlertName(current);
    if (!alertName || !managedSilence(current)) {
      throw new ForbiddenException(
        "Only Notes AI-managed silences can be removed",
      );
    }
    await this.removeSilence(configuration.alertmanager, silenceId);
    await this.database.client.insert(activityLogs).values({
      action: "admin.alert_silence.delete",
      actorId,
      details: { alertName, silenceId },
      targetType: "alertmanager_silence",
    });
    return this.getState();
  }

  private configuration(): {
    alertmanager: string;
    prometheus: string;
  } | null {
    const alertmanager = process.env.ALERTMANAGER_URL?.trim();
    const prometheus = process.env.PROMETHEUS_URL?.trim();
    if (!alertmanager && !prometheus) return null;
    if (!alertmanager || !prometheus) {
      throw new ServiceUnavailableException(
        "Alerting backend is not fully configured",
      );
    }
    return {
      alertmanager: this.internalBaseUrl(alertmanager),
      prometheus: this.internalBaseUrl(prometheus),
    };
  }

  private requireConfiguration() {
    const configuration = this.configuration();
    if (!configuration) {
      throw new ServiceUnavailableException("Alerting backend is disabled");
    }
    return configuration;
  }

  private internalBaseUrl(value: string): string {
    try {
      const url = new URL(value);
      if (
        !["http:", "https:"].includes(url.protocol) ||
        url.username ||
        url.password ||
        url.search ||
        url.hash
      ) {
        throw new Error("invalid internal URL");
      }
      return url.toString().replace(/\/$/, "");
    } catch {
      throw new ServiceUnavailableException(
        "Alerting backend configuration is invalid",
      );
    }
  }

  private async alerts(baseUrl: string) {
    const body = await this.json(`${baseUrl}/api/v2/alerts`);
    if (!Array.isArray(body)) {
      throw new ServiceUnavailableException(
        "Alerting backend returned invalid alerts",
      );
    }
    return body
      .map(object)
      .filter((item): item is JsonObject => Boolean(item))
      .map((item) => {
        const labels = object(item.labels);
        const annotations = object(item.annotations);
        const status = object(item.status);
        const alertName = label(labels, "alertname");
        if (!alertName || !alertNames.has(alertName)) return null;
        const receivers = Array.isArray(item.receivers)
          ? item.receivers
              .map(object)
              .map((receiver) => text(receiver?.name, 80))
              .filter((name): name is string => Boolean(name))
          : [];
        const silencedBy = Array.isArray(status?.silencedBy)
          ? status.silencedBy.filter(
              (id): id is string => typeof id === "string" && uuid.test(id),
            )
          : [];
        return {
          alertName: alertName as AdminAlertName,
          endsAt: timestamp(item.endsAt),
          fingerprint: text(item.fingerprint, 128),
          job: label(labels, "job"),
          jobName: label(labels, "job_name"),
          queue: label(labels, "queue"),
          receivers,
          severity:
            label(labels, "severity") === "critical" ? "critical" : "warning",
          silencedBy,
          startsAt: timestamp(item.startsAt),
          state: status?.state === "suppressed" ? "suppressed" : "active",
          summary: text(annotations?.summary, 240) ?? "Alert has no summary",
        };
      })
      .filter((item): item is NonNullable<typeof item> => Boolean(item))
      .sort((left, right) => {
        if (left.severity !== right.severity) {
          return left.severity === "critical" ? -1 : 1;
        }
        return (right.startsAt ?? "").localeCompare(left.startsAt ?? "");
      });
  }

  private async silences(baseUrl: string) {
    const body = await this.json(`${baseUrl}/api/v2/silences`);
    if (!Array.isArray(body)) {
      throw new ServiceUnavailableException(
        "Alerting backend returned invalid silences",
      );
    }
    return body
      .map(object)
      .filter((item): item is JsonObject => Boolean(item))
      .map((item) => {
        const status = object(item.status);
        const alertName = silenceAlertName(item);
        const id = text(item.id, 36);
        if (status?.state !== "active" || !alertName || !id || !uuid.test(id)) {
          return null;
        }
        return {
          alertName,
          canDelete: managedSilence(item),
          comment: text(item.comment, 200) ?? "No comment",
          endsAt: timestamp(item.endsAt),
          id,
          startsAt: timestamp(item.startsAt),
        };
      })
      .filter((item): item is NonNullable<typeof item> => Boolean(item))
      .sort((left, right) =>
        (left.endsAt ?? "").localeCompare(right.endsAt ?? ""),
      );
  }

  private async prometheusCounter(baseUrl: string, query: string) {
    const parameters = new URLSearchParams({ query });
    const body = object(
      await this.json(`${baseUrl}/api/v1/query?${parameters.toString()}`),
    );
    const data = object(body?.data);
    const result = Array.isArray(data?.result) ? data.result : [];
    const first = object(result[0]);
    const value = Array.isArray(first?.value) ? Number(first.value[1]) : 0;
    if (!Number.isFinite(value) || value < 0) {
      throw new ServiceUnavailableException(
        "Metrics backend returned an invalid counter",
      );
    }
    return value;
  }

  private async removeSilence(baseUrl: string, silenceId: string) {
    await this.json(`${baseUrl}/api/v2/silence/${silenceId}`, {
      method: "DELETE",
    });
  }

  private async json(
    url: string,
    init?: RequestInit,
    allowNotFound = false,
  ): Promise<unknown> {
    try {
      const response = await fetch(url, {
        ...init,
        signal: AbortSignal.timeout(requestTimeoutMs),
      });
      if (allowNotFound && response.status === 404) return null;
      if (!response.ok) {
        throw new Error(`upstream_${response.status}`);
      }
      if (response.status === 204) return null;
      const bytes = new Uint8Array(await response.arrayBuffer());
      if (bytes.byteLength > maximumResponseBytes) {
        throw new Error("upstream_response_too_large");
      }
      if (bytes.byteLength === 0) return null;
      return JSON.parse(new TextDecoder().decode(bytes)) as unknown;
    } catch (error) {
      if (error instanceof ServiceUnavailableException) throw error;
      throw new ServiceUnavailableException("Alerting backend is unavailable");
    }
  }
}

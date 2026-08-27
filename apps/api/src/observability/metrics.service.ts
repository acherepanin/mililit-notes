import { Injectable } from "@nestjs/common";
import {
  collectDefaultMetrics,
  Counter,
  Gauge,
  Histogram,
  Registry,
} from "prom-client";

const METHODS = new Set([
  "DELETE",
  "GET",
  "HEAD",
  "OPTIONS",
  "PATCH",
  "POST",
  "PUT",
]);
const ROUTE_TEMPLATE = /^\/[a-zA-Z0-9_./:*()-]{1,200}$/;

export function metricRoute(value: unknown): string {
  return typeof value === "string" && ROUTE_TEMPLATE.test(value)
    ? value
    : "unmatched";
}

function metricMethod(value: string): string {
  const method = value.toUpperCase();
  return METHODS.has(method) ? method : "OTHER";
}

function metricStatusClass(value: number): string {
  return Number.isInteger(value) && value >= 100 && value <= 599
    ? `${Math.floor(value / 100)}xx`
    : "unknown";
}

@Injectable()
export class MetricsService {
  private readonly active = new Gauge<"method" | "route">({
    help: "Active Notes AI API HTTP requests.",
    labelNames: ["method", "route"],
    name: "notes_api_http_requests_active",
    registers: [],
  });
  private readonly duration = new Histogram<
    "method" | "route" | "status_class"
  >({
    buckets: [0.005, 0.01, 0.025, 0.05, 0.1, 0.25, 0.5, 1, 2.5, 5, 10],
    help: "Notes AI API HTTP request duration in seconds.",
    labelNames: ["method", "route", "status_class"],
    name: "notes_api_http_request_duration_seconds",
    registers: [],
  });
  private readonly registry = new Registry();
  private readonly requests = new Counter<"method" | "route" | "status_class">({
    help: "Completed Notes AI API HTTP requests.",
    labelNames: ["method", "route", "status_class"],
    name: "notes_api_http_requests_total",
    registers: [],
  });

  constructor() {
    this.registry.registerMetric(this.active);
    this.registry.registerMetric(this.duration);
    this.registry.registerMetric(this.requests);
    collectDefaultMetrics({ prefix: "notes_api_", register: this.registry });
  }

  beginHttp(methodValue: string, routeValue: unknown): () => void {
    const method = metricMethod(methodValue);
    const route = metricRoute(routeValue);
    this.active.inc({ method, route });
    return () => this.active.dec({ method, route });
  }

  observeHttp(
    methodValue: string,
    routeValue: unknown,
    statusCode: number,
    durationSeconds: number,
  ): void {
    const labels = {
      method: metricMethod(methodValue),
      route: metricRoute(routeValue),
      status_class: metricStatusClass(statusCode),
    };
    this.requests.inc(labels);
    this.duration.observe(labels, Math.max(0, durationSeconds));
  }

  get contentType(): string {
    return this.registry.contentType;
  }

  render(): Promise<string> {
    return this.registry.metrics();
  }
}

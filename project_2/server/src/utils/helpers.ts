import { getCurrentTimestamp } from "./loggingUtil.js";
import { AlertFeature } from "./types.js";

export async function makeNWSRequest<T>(url: string): Promise<T | null> {
  try {
    const USER_AGENT = process.env.WEATHER_USER_AGENT!;
    const NWS_API_BASE = process.env.USA_WEATHER_API!;

    if (!USER_AGENT) {
      throw new Error(`${getCurrentTimestamp()} - ❌ MCPServer - USER_AGENT is not set!`);
    }

    if (!NWS_API_BASE) {
      throw new Error(`${getCurrentTimestamp()} - ❌ MCPServer - NWS_API_BASE is not set!`);
    }

    const headers = {
      "User-Agent": USER_AGENT,
      Accept: "application/geo+json",
    };

    const endpointUrl = url.startsWith("http") ? url : `${NWS_API_BASE}/${url}`;
    const response = await fetch(endpointUrl, { headers });

    if (!response.ok) {
      throw new Error(`HTTP error! status: ${response.status}`);
    }

    return (await response.json()) as T;
  } catch (error) {
    console.error("Error making NWS request:", error);

    return null;
  }
}

export async function makeWeatherAPIRequest<T>(url: string): Promise<T | null> {
  try {
    const USER_AGENT = process.env.WEATHER_USER_AGENT!;

    if (!USER_AGENT) {
      throw new Error(`${getCurrentTimestamp()} - ❌ MCPServer - USER_AGENT is not set!`);
    }
    const response = await fetch(url, {
      headers: {
        Accept: "application/json",
        "User-Agent": USER_AGENT,
      },
    });

    if (!response.ok) {
      throw new Error(`HTTP error! status: ${response.status}`);
    }

    return (await response.json()) as T;
  } catch (error) {
    console.error("Error making WeatherAPI request:", error);
    return null;
  }
}

export function formatAlert(feature: AlertFeature): string {
  const props = feature.properties;
  return [
    `Event: ${props.event || "Unknown"}`,
    `Area: ${props.areaDesc || "Unknown"}`,
    `Severity: ${props.severity || "Unknown"}`,
    `Status: ${props.status || "Unknown"}`,
    `Headline: ${props.headline || "No headline"}`,
    "---",
  ].join("\n");
}

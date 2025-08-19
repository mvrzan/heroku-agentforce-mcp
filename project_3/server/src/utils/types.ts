export interface AlertFeature {
  properties: {
    event?: string;
    areaDesc?: string;
    severity?: string;
    status?: string;
    headline?: string;
  };
}

export interface ForecastPeriod {
  name?: string;
  temperature?: number;
  temperatureUnit?: string;
  windSpeed?: string;
  windDirection?: string;
  shortForecast?: string;
}

export interface AlertsResponse {
  features: AlertFeature[];
}

export interface PointsResponse {
  properties: {
    forecast?: string;
  };
}

export interface ForecastResponse {
  properties: {
    periods: ForecastPeriod[];
  };
}

export interface WeatherAPIResponse {
  location: {
    name: string;
    region: string;
    country: string;
    lat: number;
    lon: number;
    tz_id: string;
    localtime: string;
  };
  current: {
    temp_c: number;
    condition: {
      text: string;
      icon: string;
    };
    wind_kph: number;
    wind_dir: string;
    pressure_mb: number;
    humidity: number;
    feelslike_c: number;
    vis_km: number;
    uv: number;
  };
  forecast?: {
    forecastday: Array<{
      date: string;
      day: {
        maxtemp_c: number;
        mintemp_c: number;
        avgtemp_c: number;
        condition: {
          text: string;
          icon: string;
        };
        maxwind_kph: number;
        totalprecip_mm: number;
        avghumidity: number;
        uv: number;
      };
      hour?: Array<{
        time: string;
        temp_c: number;
        condition: {
          text: string;
        };
        wind_kph: number;
        wind_dir: string;
        humidity: number;
        chance_of_rain: number;
      }>;
    }>;
  };
}

// MCP Client related types
export interface ClientInstance {
  type: "SSE" | "HTTP";
  client: any;
  identifier: string;
}

export interface UnifiedTool {
  name: string;
  description: string;
  input_schema: any;
  source: string;
  client: any;
}

export interface UnifiedResource {
  name: string;
  description: string;
  uri: string;
  source: string;
  client: any;
}

export interface MCPClientRequest {
  serverUrl?: string;
  transport?: "SSE" | "HTTP";
  query?: string;
  clientName?: string;
}

export interface MCPServerRequest {
  serverType?: string;
  query?: string;
  transport?: "SSE" | "HTTP";
}

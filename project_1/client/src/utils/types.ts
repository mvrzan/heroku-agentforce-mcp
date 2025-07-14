/**
 * TypeScript definitions for the weather data JSON structure
 */

/**
 * Climate change measurements over time
 */
export interface ClimateChange {
  /** US Temperature rise in degrees Celsius compared to 1900 baseline */
  usTemperatureRise: {
    [year: string]: number;
  };
  /** Sea level rise in centimeters compared to 1900 baseline */
  seaLevelRise: {
    [year: string]: number;
  };
  /** Arctic sea ice extent in million square kilometers */
  arcticIceDecline: {
    [year: string]: number;
  };
}

/**
 * Extreme weather event details
 */
export interface ExtremeWeatherEvent {
  /** Unique identifier for the event */
  id: string;
  /** Name of the hurricane or weather event */
  name: string;
  /** Type of extreme weather event */
  type: string;
  /** Date of the event in ISO format */
  date: string;
  /** Geographic location affected */
  location: string;
  /** US states that were impacted */
  impactedStates: string[];
  /** Number of casualties */
  casualties: number;
  /** Economic damage in billions USD */
  damageBillionsUSD: number;
  /** Maximum wind speed in mph */
  maxWindSpeed: number;
  /** Minimum barometric pressure in millibars */
  minPressure: number;
  /** Description of the event and its impacts */
  description: string;
}

/**
 * Drought event details
 */
export interface DroughtEvent {
  /** Time period of the drought */
  period: string;
  /** US states affected by the drought */
  affectedStates: string[];
  /** Economic impact in billions USD */
  economicImpactBillionsUSD: number;
  /** Number of people displaced (if applicable) */
  displacedPopulation?: number;
  /** Reservoir decline in percentage (if applicable) */
  reservoirDeclinePercent?: number;
  /** Palmer Drought Severity Index maximum value */
  maxPalmerIndex: number;
}

/**
 * Agriculture sector weather sensitivity data
 */
export interface AgricultureSector {
  /** GDP contribution percentage */
  gdpContributionPercent: number;
  /** Weather-related losses per year in billions USD */
  weatherRelatedLossesPerYear: number;
  /** Crop insurance payouts in billions USD */
  cropInsurancePayoutsBillions: number;
  /** List of crops most vulnerable to weather changes */
  mostVulnerableCrops: string[];
  /** Irrigation requirement multiplier by US region (>1 means increased need) */
  irrigationRequirementChanges: {
    [region: string]: number;
  };
}

/**
 * Energy sector weather sensitivity data
 */
export interface EnergySector {
  /** Temperature impact on energy demand as percentage */
  temperatureImpactOnDemandPercent: number;
  /** Number of weather-related outages per year */
  extremeWeatherOutages: {
    [year: string]: number;
  };
  /** Weather dependency factor for renewable energy sources (0-1 scale) */
  renewableWeatherDependency: {
    [sourceType: string]: number;
  };
}

/**
 * Transportation sector weather sensitivity data
 */
export interface TransportationSector {
  /** Weather-related transportation delays cost in billions USD */
  weatherDelaysCostBillions: number;
  /** Airport closures per year by weather cause */
  airportClosuresPerYear: {
    [weatherType: string]: number;
  };
  /** Road salt usage by state in million tons */
  roadSaltUsageByState: {
    [state: string]: number;
  };
}

/**
 * Collection of weather-sensitive economic sectors
 */
export interface WeatherSensitiveSectors {
  /** Agriculture sector data */
  agriculture: AgricultureSector;
  /** Energy sector data */
  energy: EnergySector;
  /** Transportation sector data */
  transportation: TransportationSector;
}

/**
 * Climate data for a specific geographic region over time
 */
export interface RegionalClimateData {
  /** Average temperature in Fahrenheit by time period */
  averageTemperature: {
    [timePeriod: string]: number;
  };
  /** Average rainfall in inches by time period */
  averageRainfall: {
    [timePeriod: string]: number;
  };
  /** Extreme weather event frequency (events per year) by time period */
  extremeEventFrequency: {
    [timePeriod: string]: number;
  };
}

/**
 * Weather and climate dataset - Main interface for the entire data.json file
 */
export interface WeatherDataset {
  /** Climate change measurements and trends */
  climateChange: ClimateChange;
  /** List of significant extreme weather events */
  extremeWeatherEvents: ExtremeWeatherEvent[];
  /** History of significant droughts */
  droughtHistory: {
    [droughtName: string]: DroughtEvent;
  };
  /** Economic sectors sensitive to weather changes */
  weatherSensitiveSectors: WeatherSensitiveSectors;
  /** Historical climate data by US region */
  historicalClimateByRegion: {
    [region: string]: RegionalClimateData;
  };
  /** Last updated timestamp in ISO format */
  lastUpdated: string;
  /** Source of the climate and weather data */
  dataSource: string;
}

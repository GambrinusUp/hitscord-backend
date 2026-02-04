import "dotenv/config";

export const ANNOUNCED_IP = process.env.ANNOUNCED_IP!;
export const API_URL = process.env.API_URL!;
export const RTC_MIN_PORT = Number(process.env.RTC_MIN_PORT);
export const RTC_MAX_PORT = Number(process.env.RTC_MAX_PORT);

if (Number.isNaN(RTC_MIN_PORT) || Number.isNaN(RTC_MAX_PORT)) {
  throw new Error("RTC_MIN_PORT / RTC_MAX_PORT must be numbers");
}

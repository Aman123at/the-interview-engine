export const env = {
  API_URL: process.env.NEXT_PUBLIC_API_URL ?? "http://localhost:4000",
  WS_URL: process.env.NEXT_PUBLIC_WS_URL ?? "http://localhost:4000",
} as const;

import type { NextConfig } from "next";
const nextConfig: NextConfig = {
  output: "standalone",
  outputFileTracingIncludes: {
    "/": ["./src/modern/lib/vlr/data/**/*"],
    "/api/vlr/*": ["./src/modern/lib/vlr/data/**/*"],
  },
};
export default nextConfig;

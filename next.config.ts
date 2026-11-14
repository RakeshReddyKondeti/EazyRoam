import type { NextConfig } from "next";

const nextConfig: NextConfig = {
  cacheComponents: true,
  partialPrefetching: true,
  output: "standalone", // for B's Docker image (PLAN.md §8, Person B)
};

export default nextConfig;

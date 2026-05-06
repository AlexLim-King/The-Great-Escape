import type { NextConfig } from "next";

const nextConfig: NextConfig = {
  experimental: {
    serverActions: {
      // PRD §6 targets photos up to 10 MB and videos up to 100 MB.
      // Default Next.js limit is 1 MB which fails the moment a user
      // tries to upload anything other than a small photo. 110 MB
      // gives FormData overhead headroom on top of the 100 MB ceiling.
      //
      // Note for production: Vercel's free tier caps server-action
      // request bodies around 4.5 MB regardless of this setting. The
      // production fix is direct-to-Supabase-Storage uploads via
      // signed upload URLs (browser uploads straight to storage, then
      // a small server action records the path).
      bodySizeLimit: "110mb",
    },
  },
};

export default nextConfig;

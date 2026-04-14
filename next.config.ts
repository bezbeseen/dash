import type { NextConfig } from 'next';
import path from 'path';

const nextConfig: NextConfig = {
  typedRoutes: true,
  // Parent folder has a stray package-lock.json; keep tracing rooted in this app.
  outputFileTracingRoot: path.join(__dirname),
  // Smaller self-hosted images (see Dockerfile).
  output: 'standalone',
};

export default nextConfig;

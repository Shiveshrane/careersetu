/** @type {import('next').NextConfig} */
import path from 'path';
import { fileURLToPath } from 'url';

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const talkingheadModules = path.resolve(__dirname, 'node_modules/@met4citizen/talkinghead/modules');

const nextConfig = {
  eslint: {
    ignoreDuringBuilds: true,
  },
  typescript: {
    ignoreBuildErrors: true,
  },
  images: {
    unoptimized: true,
  },
  webpack: (config, { isServer }) => {
    // Fix for cytoscape and mermaid parsing issues
    config.module.rules.push({
      test: /\.m?js$/,
      resolve: {
        fullySpecified: false,
      },
    });

    // Resolve TalkingHead lipsync dynamic imports
    config.resolve.alias = {
      ...config.resolve.alias,
      './lipsync-en.mjs': path.join(talkingheadModules, 'lipsync-en.mjs'),
      './lipsync-fi.mjs': path.join(talkingheadModules, 'lipsync-fi.mjs'),
      './lipsync-lt.mjs': path.join(talkingheadModules, 'lipsync-lt.mjs'),
      './lipsync-fr.mjs': path.join(talkingheadModules, 'lipsync-fr.mjs'),
      './lipsync-de.mjs': path.join(talkingheadModules, 'lipsync-de.mjs'),
    };

    // Exclude problematic packages from server-side builds
    if (!isServer) {
      config.resolve.fallback = {
        ...config.resolve.fallback,
        fs: false,
        net: false,
        tls: false,
      };
    }

    return config;
  },
  // Transpile problematic ESM packages
  transpilePackages: ['cytoscape', 'mermaid'],
}

export default nextConfig

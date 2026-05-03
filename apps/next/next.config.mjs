/** @type {import('next').NextConfig} */
const config = {
  output: "export",
  // Static export does not run an image optimizer at request time.
  images: { unoptimized: true },
  // Trailing slashes give every route its own /index.html — closer to the
  // shape produced by Astro/Gatsby/react-server, fewer cross-server quirks.
  trailingSlash: true,
};

export default config;

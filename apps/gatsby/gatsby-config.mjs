/** @type {import('gatsby').GatsbyConfig} */
const config = {
  siteMetadata: {
    title: "SSG bench · Gatsby",
  },
  // No GraphQL data source plugins — pages are created imperatively
  // in gatsby-node.mjs from the shared in-memory generator.
  plugins: [],
  // Cuts a lot of dev-only logging that hides at 100k pages.
  flags: {},
};

export default config;

import { fileURLToPath } from "node:url";
import path from "node:path";
import { allIds } from "@ssg-test/shared";

const __dirname = path.dirname(fileURLToPath(import.meta.url));

/** @type {import('gatsby').GatsbyNode['createPages']} */
export const createPages = async ({ actions }) => {
  const { createPage } = actions;
  const template = path.resolve(__dirname, "src/templates/post.jsx");

  // Imperative push — Gatsby has no batched/streaming API. Each call
  // appends to the Redux store, so memory grows linearly with PAGE_COUNT.
  for (const id of allIds()) {
    createPage({
      path: `/posts/${id}/`,
      component: template,
      context: { id: String(id) },
    });
  }
};

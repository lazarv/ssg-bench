import { createFileRoute } from "@tanstack/react-router";
import { PAGE_COUNT } from "@ssg-test/shared";

export const Route = createFileRoute("/")({
  component: Index,
});

function Index() {
  return (
    <main>
      <h1>SSG bench · TanStack Start</h1>
      <p>{PAGE_COUNT} posts pre-rendered.</p>
    </main>
  );
}

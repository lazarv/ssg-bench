import { PAGE_COUNT } from "@ssg-test/shared";

export default function Index() {
  return (
    <main>
      <h1>SSG bench · Next.js</h1>
      <p>{PAGE_COUNT} posts pre-rendered.</p>
    </main>
  );
}

import { PAGE_COUNT } from "@ssg-test/shared";

export default function Index() {
  return (
    <main>
      <h1>SSG bench · react-server</h1>
      <p>{PAGE_COUNT} posts pre-rendered.</p>
      <ul>
        <li><a href="/posts/1">First</a></li>
        <li><a href={`/posts/${PAGE_COUNT}`}>Last</a></li>
      </ul>
    </main>
  );
}

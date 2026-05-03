import { allIds, getPost } from "@ssg-test/shared";

// Pure SSG: params not in this list 404 at build time.
export const dynamicParams = false;

// Next requires a materialized array — there is no streaming hook.
// Peak memory grows with PAGE_COUNT; this is the framework constraint
// the benchmark is meant to surface.
export function generateStaticParams() {
  return allIds().map((id) => ({ id: String(id) }));
}

export default async function Post({ params }) {
  const { id } = await params;
  const post = getPost(Number(id));
  return (
    <article>
      <h1>{post.title}</h1>
      <p>{post.body}</p>
      <ul>
        {post.tags.map((tag) => (
          <li key={tag}>{tag}</li>
        ))}
      </ul>
      <nav aria-label="related">
        {post.neighbors.map((n) => (
          <a key={n} href={`/posts/${n}/`}>
            Post #{n}
          </a>
        ))}
      </nav>
    </article>
  );
}

import { createFileRoute } from "@tanstack/react-router";
import { getPost } from "@ssg-test/shared";

export const Route = createFileRoute("/posts/$id")({
  component: Post,
});

function Post() {
  const { id } = Route.useParams();
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

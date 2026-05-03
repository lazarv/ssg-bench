import { getPost } from "@ssg-test/shared";

export default function Post({ id }) {
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
          <a key={n} href={`/posts/${n}`}>
            Post #{n}
          </a>
        ))}
      </nav>
    </article>
  );
}

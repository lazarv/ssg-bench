import * as React from "react";
import { getPost } from "@ssg-test/shared";

export default function PostTemplate({ pageContext }) {
  const post = getPost(Number(pageContext.id));
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

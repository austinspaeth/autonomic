<script lang="ts">
  import type { Article } from '../routes/api/articles/types';
  import ArticleCover from './ArticleCover.svelte';

  export let article: Article;

  const fmtDate = (d: string) =>
    new Date(d + 'T00:00:00').toLocaleDateString('en-US', { year: 'numeric', month: 'short', day: 'numeric' });
</script>

<a class="blog-card" href={`/blog/${article.slug}/`}>
  <ArticleCover
    photoLocation={article.photoLocation}
    photoAttribution={article.photoAttribution}
    title={article.title}
    slug={article.slug}
    category={article.categories?.[0]}
  />
  <div class="bc-body">
    <p class="bc-meta">{fmtDate(article.date)} · {article.author}</p>
    <h2>{article.title}</h2>
    <p class="bc-sum">{article.summary}</p>
    <span class="bc-more">Read article →</span>
  </div>
</a>

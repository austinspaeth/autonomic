<script lang="ts">
  import type { Article } from '../routes/api/articles/types';
  import ArticleCover from './ArticleCover.svelte';
  import { formatDate, articleHref } from './site';

  export let article: Article;
</script>

<a class="blog-card" href={articleHref(article)}>
  <ArticleCover
    photoLocation={article.photoLocation}
    photoAttribution={article.photoAttribution}
    title={article.title}
    slug={article.slug}
    category={article.categories?.[0]}
  />
  <div class="bc-body">
    <p class="bc-meta">{formatDate(article.date, 'short')} · {article.author}</p>
    <h2>{article.title}</h2>
    <p class="bc-sum">{article.summary}</p>
    <span class="bc-more">Read article →</span>
  </div>
</a>

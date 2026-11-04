<!-- An answer card: the cover, then topic and reading time, the question, the summary. -->
<script lang="ts">
  import type { Article } from '../../../routes/api/articles/types';
  import ArticleCover from '$lib/ArticleCover.svelte';
  import { articleHref } from '$lib/site';
  import { cardMeta } from '../blogData';
  export let article: Article;
</script>

<a class="bl-card" href={articleHref(article)}>
  <span class="bl-card-art"><ArticleCover photoLocation={article.photoLocation} photoAttribution={article.photoAttribution} title={article.title} slug={article.slug} category={article.categories?.[0]} showTag={false} /></span>
  <span class="bl-card-body">
    <span class="bl-card-meta">{cardMeta(article)}</span>
    <span class="bl-card-t">{article.title}</span>
    <span class="bl-card-s">{article.summary}</span>
    <span class="bl-card-go">Read the full answer →</span>
  </span>
</a>

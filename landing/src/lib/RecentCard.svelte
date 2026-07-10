<script lang="ts">
  import type { Article } from '../routes/api/articles/types';
  import ArticleCover from './ArticleCover.svelte';
  import { formatDate, articleHref } from './site';

  export let article: Article;
</script>

<!-- Compact card: image on top, then title, date, summary (onboardmap "recent" style). -->
<a class="recent-card" href={articleHref(article)}>
  <div class="rc-art">
    <ArticleCover
      photoLocation={article.photoLocation}
      photoAttribution={article.photoAttribution}
      title={article.title}
      slug={article.slug}
      category={article.categories?.[0]}
    />
  </div>
  <div class="rc-body">
    <h3 class="rc-title">{article.title}</h3>
    <p class="rc-date">{formatDate(article.date, 'short')}</p>
    <p class="rc-sum">{article.summary}</p>
  </div>
</a>

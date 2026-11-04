<!-- One line of a full article list. -->
<script lang="ts">
  import type { Article } from '../../../routes/api/articles/types';
  import { articleHref, formatDate } from '$lib/site';
  import { cardMeta } from '../blogData';
  export let article: Article;
</script>

<a class="bl-row" href={articleHref(article)}>
  <span class="bl-row-main">
    <span class="bl-row-t">{article.title}</span>
    <span class="bl-row-s">{article.summary}</span>
  </span>
  <span class="bl-row-meta">{cardMeta(article)}<br /><span>{formatDate(article.date, 'short')}</span></span>
  <svg class="bl-row-ch" viewBox="0 0 24 24" aria-hidden="true"><path d="M9 6l6 6-6 6" /></svg>
</a>

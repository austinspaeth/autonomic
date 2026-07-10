<script lang="ts">
  import type { Article } from '../routes/api/articles/types';
  import { formatDate, articleHref } from './site';
  import { topicLabel } from './topics';

  export let article: Article;
  $: topic = article.categories?.[0];
</script>

<a class="article-line" href={articleHref(article)}>
  <span class="al-date">{formatDate(article.date, 'short')}</span>
  <span class="al-title">{article.title}</span>
  <span class="al-sum">{article.summary}</span>
  {#if topic}<span class="al-topic">{topicLabel(topic)}</span>{/if}
</a>

<!-- The lead story: cover on the left, the question and its short answer on the right. -->
<script lang="ts">
  import type { Article } from '../../../routes/api/articles/types';
  import ArticleCover from '$lib/ArticleCover.svelte';
  import { articleHref } from '$lib/site';
  import { topicLabel } from '$lib/topics';
  import { shortAnswer } from '../blogData';
  export let article: Article;
  export let kicker = 'Latest';
  export let showTopic = true;
</script>

<a class="bl-feat" href={articleHref(article)}>
  <div class="bl-feat-art">
    <ArticleCover photoLocation={article.photoLocation} photoAttribution={article.photoAttribution} title={article.title} slug={article.slug} category={article.categories?.[0]} showTag={false} eager />
  </div>
  <div class="bl-feat-body">
    <span class="bl-feat-k">{kicker}{#if showTopic && article.categories?.[0]} · {topicLabel(article.categories[0])}{/if}</span>
    <span class="bl-feat-t">{article.title}</span>
    <span class="bl-short"><b>Short answer</b>{shortAnswer(article)}</span>
    <span class="bl-feat-foot"><span class="bl-feat-go">Read the full answer →</span><span>{article.readMin ? `${article.readMin} min · ` : ''}{article.author}</span></span>
  </div>
</a>

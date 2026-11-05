<!-- The head of every feature, condition and product page: title, canonical,
     social cards, a breadcrumb trail and (when given) FAQ structured data. A
     page under /conditions/ passes its own `section`; `ld` carries anything
     else the page describes (a MedicalWebPage, the app's offers). -->
<script lang="ts">
  import { appLd } from './appLd';
  import { SOURCES_REVIEWED, type Source } from './sources';
  export let title: string;
  export let description: string;
  export let path: string;
  export let name: string;
  export let faq: { q: string; a: string }[] = [];
  /** The breadcrumb's middle step. Null for a page that sits at the top level. */
  export let section: { name: string; path: string } | null = { name: 'Features', path: '/features/' };
  export let ld: Record<string, unknown>[] = [];
  /** Defaults to the page's own share card (static/og/features, made by
   *  scripts/gen-feature-og.mjs) for a feature page, the site card otherwise. */
  export let image = '';
  $: seg = path.split('/')[2] || '';
  $: flat = { '/pricing/': 'pricing', '/story/': 'story', '/press/': 'press' }[path] || '';
  $: cardSlug = flat ? flat : path.startsWith('/features/') ? seg || 'features' : path.startsWith('/conditions/') && seg ? `condition-${seg}` : path.startsWith('/compare/') ? (seg ? `compare-${seg}` : 'compare') : '';
  $: img = image || (cardSlug ? `https://autonomic.care/og/features/${cardSlug}.jpg` : 'https://autonomic.care/og.png');
  /** A feature page's own entity data: what the feature does, the conditions it
   *  is for and the research it cites. Given `features`, the page is described
   *  as a MedicalWebPage about the app, with its sources as citations. */
  export let features: string[] = [];
  /** Conditions the page is about: a name, or a name with its other names and its page. */
  export let about: (string | { name: string; alternateName?: string[]; url?: string })[] = [];
  export let sources: Source[] = [];
  $: url = `https://autonomic.care${path}`;
  $: crumbs = {
    '@context': 'https://schema.org',
    '@type': 'BreadcrumbList',
    itemListElement: [
      { '@type': 'ListItem', position: 1, name: 'Home', item: 'https://autonomic.care/' },
      ...(section ? [{ '@type': 'ListItem', position: 2, name: section.name, item: `https://autonomic.care${section.path}` }] : []),
      { '@type': 'ListItem', position: section ? 3 : 2, name, item: url }
    ]
  };
  $: faqLd = faq.length
    ? {
        '@context': 'https://schema.org',
        '@type': 'FAQPage',
        mainEntity: faq.map((f) => ({ '@type': 'Question', name: f.q, acceptedAnswer: { '@type': 'Answer', text: f.a } }))
      }
    : null;
  const app = appLd();
  $: pageLd = features.length
    ? {
        '@context': 'https://schema.org',
        '@type': 'MedicalWebPage',
        '@id': `${url}#webpage`,
        url,
        name: title,
        description,
        inLanguage: 'en-US',
        isPartOf: { '@id': 'https://autonomic.care/#website' },
        primaryImageOfPage: img,
        dateModified: SOURCES_REVIEWED,
        author: { '@type': 'Person', name: 'Austin Spaeth', url: 'https://autonomic.care/insights/writers/austin-spaeth/', jobTitle: 'Founder, Autonomic' },
        publisher: { '@id': 'https://autonomic.care/#organization' },
        ...(about.length ? { about: about.map((a) => ({ '@type': 'MedicalCondition', ...(typeof a === 'string' ? { name: a } : a) })) } : {}),
        mainEntity: { ...app, featureList: features },
        ...(sources.length
          ? {
              citation: sources.map((c) => ({
                '@type': c.kind || 'ScholarlyArticle',
                name: c.title,
                author: c.authors,
                datePublished: String(c.year),
                publisher: c.where,
                url: c.url
              }))
            }
          : {})
      }
    : null;
  $: blocks = [crumbs, ...(faqLd ? [faqLd] : []), ...(pageLd ? [pageLd] : []), ...ld];
</script>

<svelte:head>
  <title>{title}</title>
  <meta name="description" content={description} />
  <link rel="canonical" href={url} />
  <meta property="og:type" content="website" />
  <meta property="og:url" content={url} />
  <meta property="og:title" content={title} />
  <meta property="og:description" content={description} />
  <meta property="og:image" content={img} />
  <meta property="og:image:alt" content={title} />
  <meta property="og:image:width" content="1200" />
  <meta property="og:image:height" content="630" />
  <meta name="twitter:card" content="summary_large_image" />
  <meta name="twitter:title" content={title} />
  <meta name="twitter:description" content={description} />
  <meta name="twitter:image" content={img} />
  {#each blocks as b}{@html `<script type="application/ld+json">${JSON.stringify(b)}<\/script>`}{/each}
</svelte:head>

import { Helmet } from "react-helmet-async";

const SITE_URL = "https://nrsrmp.codeware.com.ng";
const DEFAULT_OG_IMAGE = `${SITE_URL}/uploads/d8c99973-7738-403f-be00-c2db452b33f4.png`;

interface SeoHeadProps {
  title: string;
  description: string;
  path: string;
  image?: string;
  type?: "website" | "article";
  jsonLd?: Record<string, unknown> | Record<string, unknown>[];
}

/**
 * Per-route SEO metadata. `title` should be page-specific — the component
 * appends the site suffix. `path` is the route path, used to build
 * self-referencing canonical and og:url values.
 */
export function SeoHead({
  title,
  description,
  path,
  image = DEFAULT_OG_IMAGE,
  type = "website",
  jsonLd,
}: SeoHeadProps) {
  const fullTitle = `${title} — NRS Risk Management Portal`;
  const canonical = `${SITE_URL}${path.startsWith("/") ? path : `/${path}`}`;
  const ogImage = image.startsWith("http") ? image : `${SITE_URL}${image.startsWith("/") ? image : `/${image}`}`;
  const schemas = jsonLd ? (Array.isArray(jsonLd) ? jsonLd : [jsonLd]) : [];

  return (
    <Helmet>
      <title>{fullTitle}</title>
      <meta name="description" content={description} />
      <link rel="canonical" href={canonical} />
      <meta property="og:type" content={type} />
      <meta property="og:title" content={fullTitle} />
      <meta property="og:description" content={description} />
      <meta property="og:url" content={canonical} />
      <meta property="og:image" content={ogImage} />
      <meta name="twitter:card" content="summary_large_image" />
      <meta name="twitter:title" content={fullTitle} />
      <meta name="twitter:description" content={description} />
      <meta name="twitter:image" content={ogImage} />
      {schemas.map((schema, idx) => (
        <script key={idx} type="application/ld+json">
          {JSON.stringify(schema)}
        </script>
      ))}
    </Helmet>
  );
}

export { SITE_URL };

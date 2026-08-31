import { Helmet } from 'react-helmet-async';

interface SEOHeadProps {
  title?: string;
  description?: string;
  image?: string;
  url?: string;
  type?: 'website' | 'article' | 'product';
  author?: string;
  publishedTime?: string;
  modifiedTime?: string;
  keywords?: string[];
  price?: number;
  currency?: string;
  availability?: 'InStock' | 'OutOfStock' | 'PreOrder';
  noindex?: boolean;
  structuredData?: Record<string, any> | Record<string, any>[];
}

const SEOHead = ({
  title = "Scoly — Fournitures scolaires et bureautiques en Côte d'Ivoire",
  description = "Scoly, votre référence en Côte d'Ivoire pour les fournitures scolaires et bureautiques de qualité. Livraison gratuite sur toutes vos commandes.",
  image = "https://scoly.ci/og-image.jpg",
  url,
  type = "website",
  author,
  publishedTime,
  modifiedTime,
  keywords = ["fournitures scolaires", "bureautique", "Côte d'Ivoire", "Abidjan", "livraison gratuite", "Scoly"],
  price,
  currency = "XOF",
  availability,
  noindex = false,
  structuredData: customStructuredData,
}: SEOHeadProps) => {
  const fullTitle = title.includes("Scoly") ? title : `${title} | Scoly`;

  // Seul scoly.ci est indexable : toute autre origine (aperçu Lovable, etc.) est
  // forcée en noindex et le canonique pointe toujours vers le domaine officiel.
  const CANONICAL_ORIGIN = "https://scoly.ci";
  const currentPath =
    typeof window !== "undefined" ? window.location.pathname + window.location.search : "/";
  const canonicalUrl = (() => {
    try {
      const u = new URL(url ?? currentPath, CANONICAL_ORIGIN);
      return `${CANONICAL_ORIGIN}${u.pathname}${u.search}`;
    } catch {
      return CANONICAL_ORIGIN;
    }
  })();
  const host = typeof window !== "undefined" ? window.location.hostname : "scoly.ci";
  const isCanonicalHost = host === "scoly.ci" || host === "www.scoly.ci";
  const blockIndexing = noindex || !isCanonicalHost;
  // Les crawlers sociaux exigent une URL d'image absolue.
  const absoluteImage = /^https?:\/\//i.test(image) ? image : `${CANONICAL_ORIGIN}${image.startsWith("/") ? "" : "/"}${image}`;

  
  const fallbackStructuredData = type === 'product' && price ? {
    "@context": "https://schema.org",
    "@type": "Product",
    "name": title,
    "description": description,
    "image": absoluteImage,
    "offers": {
      "@type": "Offer",
      "price": price,
      "priceCurrency": currency,
      "availability": availability ? `https://schema.org/${availability}` : "https://schema.org/InStock",
      "seller": {
        "@type": "Organization",
        "name": "Scoly"
      }
    }
  } : type === 'article' ? {
    "@context": "https://schema.org",
    "@type": "Article",
    "headline": title,
    "description": description,
    "image": absoluteImage,
    "author": author ? {
      "@type": "Person",
      "name": author
    } : undefined,
    "datePublished": publishedTime,
    "dateModified": modifiedTime || publishedTime,
    "publisher": {
      "@type": "Organization",
      "name": "Scoly",
      "logo": {
        "@type": "ImageObject",
        "url": "https://scoly.ci/logo-scoly.png"
      }
    }
  } : null;
  const jsonLd = customStructuredData ?? fallbackStructuredData;
  const jsonLdItems = Array.isArray(jsonLd) ? jsonLd : jsonLd ? [jsonLd] : [];

  return (
    <Helmet>
      {/* Basic Meta */}
      <title>{fullTitle}</title>
      <meta name="description" content={description} />
      <meta name="keywords" content={keywords.join(', ')} />
      <link rel="canonical" href={canonicalUrl} />
      
      {blockIndexing && <meta name="robots" content="noindex, nofollow, noarchive, nosnippet, noimageindex" />}
      {blockIndexing && <meta name="googlebot" content="noindex, nofollow" />}
      
      {/* Open Graph */}
      <meta property="og:type" content={type} />
      <meta property="og:url" content={canonicalUrl} />
      <meta property="og:title" content={fullTitle} />
      <meta property="og:description" content={description} />
      <meta property="og:image" content={absoluteImage} />
      <meta property="og:image:width" content="1200" />
      <meta property="og:image:height" content="630" />
      <meta property="og:site_name" content="Scoly" />
      <meta property="og:locale" content="fr_CI" />
      
      {/* Twitter */}
      <meta name="twitter:card" content="summary_large_image" />
      <meta name="twitter:url" content={canonicalUrl} />
      <meta name="twitter:title" content={fullTitle} />
      <meta name="twitter:description" content={description} />
      <meta name="twitter:image" content={absoluteImage} />
      
      {/* Article specific */}
      {type === 'article' && publishedTime && (
        <meta property="article:published_time" content={publishedTime} />
      )}
      {type === 'article' && modifiedTime && (
        <meta property="article:modified_time" content={modifiedTime} />
      )}
      {type === 'article' && author && (
        <meta property="article:author" content={author} />
      )}
      
      {/* Product specific */}
      {type === 'product' && price && (
        <>
          <meta property="product:price:amount" content={price.toString()} />
          <meta property="product:price:currency" content={currency} />
        </>
      )}
      
      {/* Structured Data */}
      {jsonLdItems.map((item, index) => (
        <script key={index} type="application/ld+json">
          {JSON.stringify(item)}
        </script>
      ))}
    </Helmet>
  );
};

export default SEOHead;

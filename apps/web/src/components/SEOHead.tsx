import { Title, Meta, Link } from "@solidjs/meta";
import type { JSX } from "solid-js";

const SITE_NAME = import.meta.env.VITE_SITE_NAME ?? "Back to the Future";
const BASE_URL =
  import.meta.env.VITE_PUBLIC_URL ??
  (typeof window !== "undefined" ? window.location.origin : "http://localhost:3000");
const DEFAULT_OG_IMAGE = `${BASE_URL}/og-image.png`;

interface SEOHeadProps {
  title: string;
  description: string;
  path: string;
  ogType?: string;
  ogImage?: string;
}

export function SEOHead(props: SEOHeadProps): JSX.Element {
  const fullTitle = (): string =>
    props.title === SITE_NAME
      ? props.title
      : `${props.title} - ${SITE_NAME}`;
  const canonicalUrl = (): string => `${BASE_URL}${props.path}`;
  const ogImage = (): string => props.ogImage ?? DEFAULT_OG_IMAGE;
  const ogType = (): string => props.ogType ?? "website";

  return (
    <>
      <Title>{fullTitle()}</Title>
      <Meta name="description" content={props.description} />
      <Meta property="og:title" content={fullTitle()} />
      <Meta property="og:description" content={props.description} />
      <Meta property="og:type" content={ogType()} />
      <Meta property="og:image" content={ogImage()} />
      <Meta property="og:url" content={canonicalUrl()} />
      <Meta property="og:site_name" content={SITE_NAME} />
      <Meta name="twitter:card" content="summary_large_image" />
      <Meta name="twitter:title" content={fullTitle()} />
      <Meta name="twitter:description" content={props.description} />
      <Meta name="twitter:image" content={ogImage()} />
      <Link rel="canonical" href={canonicalUrl()} />
    </>
  );
}

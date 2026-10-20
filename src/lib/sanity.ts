import { createClient } from '@sanity/client';
import { createImageUrlBuilder } from '@sanity/image-url';

/**
 * Content comes from the madebyfn Sanity project, filtered to the projects
 * whose Developers field credits Fadi. Editing a project in the madebyfn
 * Studio updates this site on its next build.
 */
export const DEVELOPER_ID = 'developer-fadi-zakharia';

const projectId = import.meta.env.PUBLIC_SANITY_PROJECT_ID || 'nfwf1z6i';
const dataset = import.meta.env.PUBLIC_SANITY_DATASET || 'production';

const client = createClient({
  projectId,
  dataset,
  apiVersion: '2025-06-01',
  useCdn: false,
  perspective: 'published',
});

const builder = createImageUrlBuilder({ projectId, dataset });

export interface SanityImage {
  alt?: string;
  asset?: { _ref: string };
}

export function imageUrl(image: SanityImage | undefined, width: number, height?: number) {
  if (!image?.asset) return undefined;
  let b = builder.image(image).width(width).auto('format').quality(80);
  if (height) b = b.height(height).fit('crop');
  return b.url();
}

export interface Metric {
  label: string;
  value: string;
}

export interface Project {
  _id: string;
  name: string;
  slug: string;
  year?: string;
  statement?: string;
  shortDescription?: string;
  fullDescription?: string;
  headlineResult?: string;
  role?: string;
  industry?: string;
  externalLink?: string;
  challenge?: string;
  solution?: string;
  architecture?: string;
  engineering?: string;
  results?: string;
  tags: string[];
  tech: string[];
  metrics: Metric[];
  heroImage?: SanityImage;
  mobileHeroImage?: SanityImage;
  gallery: SanityImage[];
  /** Other developers credited on the project, e.g. Nad on shared work. */
  collaborators: { name: string; slug?: string }[];
  order?: number;
}

export interface Profile {
  name: string;
  title?: string;
  shortTitle?: string;
  shortBio?: string;
  longBio?: string;
  approachQuote?: string;
  location?: string;
  github?: string;
  linkedin?: string;
  yearsOfExperience?: number;
  skills: string[];
  specializations: string[];
  portrait?: SanityImage;
  featured: string[];
}

const projectFields = /* groq */ `
  _id, name, "slug": slug.current, year, statement, shortDescription, fullDescription,
  headlineResult, role, externalLink, challenge, solution, architecture, engineering, results,
  order, heroImage, mobileHeroImage,
  "industry": coalesce(industryLabel, industry->title),
  "tags": coalesce(serviceTags, []),
  "tech": coalesce(technologies[]->name, []),
  "metrics": coalesce(metrics[]{label, value}, []),
  "gallery": coalesce(gallery, []),
  "collaborators": coalesce(developers[_ref != $dev]->{name, "slug": slug.current}, [])
`;

const projectsQuery = /* groq */ `
  *[_type == "project" && references($dev) && defined(slug.current)]
    | order(coalesce(order, 999) asc, year desc) { ${projectFields} }
`;

const profileQuery = /* groq */ `
  *[_id == $dev][0]{
    name, title, shortTitle, shortBio, longBio, approachQuote, location, github, linkedin,
    yearsOfExperience, portrait,
    "skills": coalesce(skills, []),
    "specializations": coalesce(specializations, []),
    "featured": coalesce(featuredProjects[]._ref, [])
  }
`;

let projectsCache: Promise<Project[]> | undefined;

export function getProjects(): Promise<Project[]> {
  projectsCache ??= client.fetch<Project[]>(projectsQuery, { dev: DEVELOPER_ID });
  return projectsCache;
}

export async function getProfile(): Promise<Profile> {
  const profile = await client.fetch<Profile | null>(profileQuery, { dev: DEVELOPER_ID });
  if (!profile) throw new Error(`Developer ${DEVELOPER_ID} not found in Sanity`);
  return profile;
}

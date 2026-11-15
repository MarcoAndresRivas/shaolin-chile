// Instagram photos from @shaolinguanchile, keyed by post id.
const modules = import.meta.glob('../assets/instagram/*.jpg', { eager: true });

export const instagramImages = Object.fromEntries(
  Object.entries(modules).map(([path, mod]) => [path.split('/').pop().replace('.jpg', ''), mod.default]),
);

export function instagramImage(id) {
  const image = instagramImages[id];
  if (!image) throw new Error(`Missing Instagram image: ${id}`);
  return image;
}

export function instagramPostUrl({ id, kind }) {
  return `https://www.instagram.com/${kind}/${id}/`;
}

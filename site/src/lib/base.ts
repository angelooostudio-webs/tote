/** URL of a file in public/, respecting the deploy base (e.g. /tote/ on GitHub Pages). */
export const asset = (path: string) => import.meta.env.BASE_URL + path.replace(/^\//, "");

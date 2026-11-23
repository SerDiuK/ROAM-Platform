/** @type {import('next').NextConfig} */
// Next.js requires a default export here.
const nextConfig = {
	transpilePackages: ["@roam/api", "@roam/shared", "@roam/ui"],
};

export default nextConfig;

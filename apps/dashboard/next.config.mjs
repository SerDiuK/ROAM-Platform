/** @type {import('next').NextConfig} */
// Next.js config requires default export — exception to the named-export convention
const nextConfig = {
	transpilePackages: ["@roam/api", "@roam/shared", "@roam/ui"],
};

export default nextConfig;

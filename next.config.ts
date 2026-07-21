import type { NextConfig } from "next";

const nextConfig: NextConfig = {
  // pdfkit 内部使用 __dirname 加载字体文件（Helvetica.afm 等），
  // 需要确保这些文件在部署时被打包到产物中
  outputFileTracingIncludes: {
    "/admin/**": [
      "./node_modules/pdfkit/js/data/**",
    ],
  },
};

export default nextConfig;

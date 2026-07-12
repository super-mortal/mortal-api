'use client';

import { useRouter } from 'next/navigation';
import { InlineIcon } from '@/lib/icon';

export default function HomePage() {
  const router = useRouter();

  return (
    <div className="min-h-screen flex flex-col">
      {/* Nav */}
      <nav className="border-b border-gray-100 bg-white/80 backdrop-blur-sm sticky top-0 z-50">
        <div className="max-w-6xl mx-auto px-4 sm:px-6 h-14 sm:h-16 flex items-center justify-between">
          <div className="flex items-center gap-2.5">
            <div className="w-7 h-7 sm:w-8 sm:h-8 rounded-lg bg-gradient-to-br from-indigo-500 to-purple-600 flex items-center justify-center text-white font-bold text-xs sm:text-sm">
              M
            </div>
            <span className="font-semibold text-base sm:text-lg text-gray-900">Mortal API</span>
          </div>
          <div className="flex items-center gap-2 sm:gap-3">
            <a
              href="https://github.com"
              className="text-xs sm:text-sm text-gray-500 hover:text-gray-700 transition-colors hidden sm:inline"
              target="_blank"
              rel="noreferrer"
            >
              <InlineIcon name="github" className="w-4 h-4 inline mr-1" />
              GitHub
            </a>
            <button
              onClick={() => router.push('/login')}
              className="text-xs sm:text-sm px-3 sm:px-4 py-1.5 sm:py-2 rounded-lg bg-gray-900 text-white hover:bg-gray-800 transition-colors font-medium"
            >
              管理后台
            </button>
          </div>
        </div>
      </nav>

      {/* Hero */}
      <section className="flex-1 flex flex-col items-center justify-center px-4 sm:px-6 py-16 sm:py-20">
        <div className="max-w-3xl mx-auto text-center">
          <div className="inline-flex items-center gap-1.5 px-3 py-1 rounded-full bg-indigo-50 text-indigo-600 text-xs font-medium mb-6 sm:mb-8 border border-indigo-100">
            <InlineIcon name="zap" className="w-3 h-3" />
            兼容 OpenAI API 格式
          </div>
          <h1 className="text-3xl sm:text-4xl lg:text-5xl font-bold text-gray-900 leading-tight tracking-tight mb-4 sm:mb-5">
            AI 大模型 API
            <br />
            <span className="bg-gradient-to-r from-indigo-500 to-purple-600 bg-clip-text text-transparent">
              一站式中转站
            </span>
          </h1>
          <p className="text-sm sm:text-lg text-gray-500 max-w-xl mx-auto leading-relaxed mb-8 sm:mb-10 px-2">
            只需修改 base_url 和 api_key，即可接入 DeepSeek、智谱 GLM、通义千问
            等多个国产大模型。自动负载均衡、智能重试、用量统计。
          </p>
          <div className="flex flex-col sm:flex-row items-center justify-center gap-3">
            <button
              onClick={() => router.push('/login')}
              className="w-full sm:w-auto px-6 py-2.5 rounded-lg bg-gray-900 text-white hover:bg-gray-800 transition-colors font-medium text-sm"
            >
              进入管理后台
            </button>
            <code className="px-4 py-2 rounded-lg bg-gray-50 border border-gray-200 text-xs sm:text-sm text-gray-600 font-mono">
              sk-mortal-xxx
            </code>
          </div>
        </div>
      </section>

      {/* Features */}
      <section className="border-t border-gray-100 py-12 sm:py-16 px-4 sm:px-6">
        <div className="max-w-5xl mx-auto">
          <div className="grid grid-cols-1 sm:grid-cols-3 gap-4 sm:gap-6">
            {[
              { icon: 'zap', title: '完全兼容', desc: '兼容 OpenAI Chat Completions API，支持流式与非流式' },
              { icon: 'server', title: '智能路由', desc: '多模型负载均衡，请求失败自动重试，渠道健康检测' },
              { icon: 'chart-line', title: '用量统计', desc: '详细记录 Token 消耗，可视化仪表盘，分模型统计' },
            ].map((f) => (
              <div key={f.title} className="rounded-xl border border-gray-100 bg-white p-5 sm:p-6">
                <div className="w-9 h-9 sm:w-10 sm:h-10 rounded-lg bg-indigo-50 flex items-center justify-center text-indigo-600 mb-3">
                  <InlineIcon name={f.icon} className="w-4 h-4 sm:w-5 sm:h-5" />
                </div>
                <h3 className="font-semibold text-gray-900 mb-1 text-sm sm:text-base">{f.title}</h3>
                <p className="text-xs sm:text-sm text-gray-500 leading-relaxed">{f.desc}</p>
              </div>
            ))}
          </div>
        </div>
      </section>

      {/* Footer */}
      <footer className="border-t border-gray-100 py-5 sm:py-6 px-4 sm:px-6">
        <div className="max-w-6xl mx-auto flex items-center justify-between text-xs sm:text-sm text-gray-400">
          <span>Mortal API</span>
          <div className="flex items-center gap-3">
            <a href="https://github.com" className="hover:text-gray-600 transition-colors"><InlineIcon name="github" className="w-4 h-4" /></a>
            <span>Built with Next.js</span>
          </div>
        </div>
      </footer>
    </div>
  );
}

const capabilities = [
  {
    number: '01',
    title: '可靠底座',
    description: 'Fastify、PostgreSQL 与模块化事务边界已经就绪。',
  },
  { number: '02', title: '安全默认', description: 'Session、CSRF、权限和审计能力从第一天启用。' },
  { number: '03', title: '持续交付', description: '测试、Docker 与 CI 门禁共同保护每一次发布。' },
];

export function App() {
  return (
    <main className="site-shell">
      <nav className="site-nav" aria-label="主导航">
        <a className="site-brand" href="#top" aria-label="Fastify Business 首页">
          <span>FB</span>
          <strong>Fastify Business</strong>
        </a>
        <div className="site-nav__links">
          <a href="#capabilities">能力</a>
          <a href="/admin/">管理后台</a>
          <a className="site-nav__button" href="#start">
            开始构建
          </a>
        </div>
      </nav>

      <section className="site-hero" id="top">
        <div className="site-hero__copy">
          <span className="site-eyebrow">
            <i /> Production-ready TypeScript Starter
          </span>
          <h1>
            把复杂留给底座，
            <br />
            <em>把创造留给业务。</em>
          </h1>
          <p>一套清晰、可靠、可持续演进的业务应用起点。无需重复搭建认证、权限、任务与交付体系。</p>
          <div className="site-actions" id="start">
            <a className="site-action site-action--primary" href="/admin/">
              查看管理后台 <span>↗</span>
            </a>
            <a className="site-action site-action--secondary" href="#capabilities">
              了解基础能力
            </a>
          </div>
          <div className="site-proof">
            <span>
              <b>12</b> 通用模块
            </span>
            <span>
              <b>2</b> 独立应用入口
            </span>
            <span>
              <b>1</b> 条完整交付链路
            </span>
          </div>
        </div>

        <div className="site-preview" aria-label="后台界面预览">
          <div className="site-preview__bar">
            <div>
              <i />
              <i />
              <i />
            </div>
            <span>Business Console</span>
            <small>● Online</small>
          </div>
          <div className="site-preview__body">
            <aside>
              <span className="site-preview__logo">FB</span>
              {[0, 1, 2, 3, 4].map((item) => (
                <i key={item} className={item === 0 ? 'is-active' : ''} />
              ))}
            </aside>
            <div className="site-preview__content">
              <header>
                <span>工作台</span>
                <i />
              </header>
              <div className="site-preview__welcome">
                <small>PRODUCTION READY</small>
                <strong>欢迎回来</strong>
                <span>专注构建真正重要的业务。</span>
              </div>
              <div className="site-preview__metrics">
                {['服务正常', '12 项能力', '安全基线'].map((item, index) => (
                  <div key={item}>
                    <i className={`tone-${index}`} />
                    <span>{item}</span>
                    <b>{index === 0 ? '●' : '✓'}</b>
                  </div>
                ))}
              </div>
              <div className="site-preview__panels">
                <div />
                <div />
              </div>
            </div>
          </div>
        </div>
      </section>

      <section className="site-capabilities" id="capabilities">
        <div className="site-section-heading">
          <span>Built for real business</span>
          <h2>
            不是空白脚手架，
            <br />
            而是经过验证的起点。
          </h2>
        </div>
        <div className="site-capability-grid">
          {capabilities.map((capability) => (
            <article key={capability.number}>
              <span>{capability.number}</span>
              <h3>{capability.title}</h3>
              <p>{capability.description}</p>
            </article>
          ))}
        </div>
      </section>

      <footer className="site-footer">
        <span>Fastify Business Starter</span>
        <small>为下一套业务系统准备。</small>
      </footer>
    </main>
  );
}

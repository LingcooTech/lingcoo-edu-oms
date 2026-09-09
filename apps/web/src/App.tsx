const adminUrl = import.meta.env.VITE_ADMIN_URL ?? '/admin/';

const migrationScope = [
  {
    number: '01',
    title: '账号迁移',
    description: '管理员可使用邮箱或手机号登录，原有邮箱登录方式继续支持。',
  },
  {
    number: '02',
    title: '访问治理',
    description: '沿用角色与权限边界，管理运营账号的启用状态和职责。',
  },
  {
    number: '03',
    title: '凭据保护',
    description: '新建和重置后的临时密码，需要在首次登录时完成更新。',
  },
];

export function App() {
  return (
    <main className="site-shell">
      <nav className="site-nav" aria-label="主导航">
        <a className="site-brand" href="#top" aria-label="Lingcoo Edu OMS 首页">
          <span>LE</span>
          <strong>Lingcoo Edu OMS</strong>
        </a>
        <div className="site-nav__links">
          <a href="#phase-one">迁移一期</a>
          <a className="site-nav__button" href={adminUrl}>
            管理后台
          </a>
        </div>
      </nav>

      <section className="site-hero" id="top">
        <div className="site-hero__copy">
          <span className="site-eyebrow">
            <i /> Education OMS · Migration Phase 1
          </span>
          <h1>
            为教育运营，
            <br />
            <em>先建立可信入口。</em>
          </h1>
          <p>
            Lingcoo Edu OMS
            正在迁移。第一期聚焦运营管理员身份：登录方式、账号管理、角色权限与密码安全。
          </p>
          <div className="site-actions">
            <a className="site-action site-action--primary" href={adminUrl}>
              进入管理后台 <span>↗</span>
            </a>
            <a className="site-action site-action--secondary" href="#phase-one">
              查看本期范围
            </a>
          </div>
        </div>

        <div className="site-preview" aria-label="教育 OMS 迁移一期概览">
          <div className="site-preview__bar">
            <div>
              <i />
              <i />
              <i />
            </div>
            <span>Lingcoo Edu OMS</span>
            <small>Migration phase 1</small>
          </div>
          <div className="site-preview__body">
            <aside>
              <span className="site-preview__logo">LE</span>
              {[0, 1, 2, 3].map((item) => (
                <i key={item} className={item === 0 ? 'is-active' : ''} />
              ))}
            </aside>
            <div className="site-preview__content">
              <header>
                <span>迁移工作台</span>
                <i />
              </header>
              <div className="site-preview__welcome">
                <small>PHASE 1 · IDENTITY MIGRATION</small>
                <strong>安全接入运营团队</strong>
                <span>仅展示本期已接入的身份与访问能力。</span>
              </div>
              <div className="site-preview__metrics">
                {['邮箱或手机号登录', '账号与角色', '首次修改密码'].map((item, index) => (
                  <div key={item}>
                    <i className={`tone-${index}`} />
                    <span>{item}</span>
                    <b>✓</b>
                  </div>
                ))}
              </div>
              <div className="site-preview__notice">
                <span>后续接入</span>
                <strong>学员、教学内容与订单</strong>
              </div>
            </div>
          </div>
        </div>
      </section>

      <section className="site-capabilities" id="phase-one">
        <div className="site-section-heading">
          <span>Migration scope</span>
          <h2>
            本期只做已经就绪的事，
            <br />
            清晰地为后续迁移留出空间。
          </h2>
        </div>
        <div className="site-capability-grid">
          {migrationScope.map((item) => (
            <article key={item.number}>
              <span>{item.number}</span>
              <h3>{item.title}</h3>
              <p>{item.description}</p>
            </article>
          ))}
        </div>
      </section>

      <footer className="site-footer">
        <span>Lingcoo Edu OMS</span>
        <small>教育运营系统迁移一期</small>
      </footer>
    </main>
  );
}
